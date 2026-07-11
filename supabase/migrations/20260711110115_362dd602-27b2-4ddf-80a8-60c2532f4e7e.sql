-- Admin audit log
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE INDEX idx_audit_created ON public.admin_audit_log (created_at DESC);
CREATE INDEX idx_audit_entity ON public.admin_audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_actor ON public.admin_audit_log (actor_id, created_at DESC);

-- Helper: server-side write bypasses RLS via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _entity_type text,
  _entity_id text,
  _before jsonb,
  _after jsonb,
  _metadata jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (auth.uid(), _email, _action, _entity_type, _entity_id, _before, _after, _metadata)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb, jsonb, jsonb) TO authenticated;

-- Profit/loss aggregate view (read via RPC to enforce admin-only)
CREATE OR REPLACE FUNCTION public.admin_profit_report(
  _from timestamptz,
  _to timestamptz,
  _granularity text DEFAULT 'day'
) RETURNS TABLE (
  bucket timestamptz,
  orders_count bigint,
  revenue numeric,
  cost numeric,
  profit numeric,
  refunds numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      date_trunc(_granularity, o.created_at) AS bucket,
      o.id AS order_id,
      COALESCE(o.total_try, 0)::numeric AS revenue,
      COALESCE(SUM(oi.qty * COALESCE(p.external_price, 0)), 0)::numeric AS cost,
      o.status
    FROM public.orders o
    LEFT JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE o.created_at >= _from AND o.created_at < _to
    GROUP BY o.id, o.created_at, o.total_try, o.status
  )
  SELECT
    s.bucket,
    COUNT(*) FILTER (WHERE s.status IN ('paid','delivered','completed'))::bigint AS orders_count,
    COALESCE(SUM(s.revenue) FILTER (WHERE s.status IN ('paid','delivered','completed')), 0) AS revenue,
    COALESCE(SUM(s.cost)    FILTER (WHERE s.status IN ('paid','delivered','completed')), 0) AS cost,
    COALESCE(SUM(s.revenue - s.cost) FILTER (WHERE s.status IN ('paid','delivered','completed')), 0) AS profit,
    COALESCE(SUM(s.revenue) FILTER (WHERE s.status IN ('refunded','cancelled')), 0) AS refunds
  FROM scoped s
  GROUP BY s.bucket
  ORDER BY s.bucket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_profit_report(timestamptz, timestamptz, text) TO authenticated;

-- Per-product profit breakdown
CREATE OR REPLACE FUNCTION public.admin_profit_by_product(
  _from timestamptz,
  _to timestamptz
) RETURNS TABLE (
  product_id uuid,
  product_name text,
  qty_sold bigint,
  revenue numeric,
  cost numeric,
  profit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    COALESCE(SUM(oi.qty), 0)::bigint AS qty_sold,
    COALESCE(SUM(oi.qty * oi.unit_price_try), 0)::numeric AS revenue,
    COALESCE(SUM(oi.qty * COALESCE(p.external_price, 0)), 0)::numeric AS cost,
    COALESCE(SUM(oi.qty * (oi.unit_price_try - COALESCE(p.external_price, 0))), 0)::numeric AS profit
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.id = oi.product_id
  WHERE o.created_at >= _from AND o.created_at < _to
    AND o.status IN ('paid','delivered','completed')
  GROUP BY p.id, p.name
  ORDER BY profit DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_profit_by_product(timestamptz, timestamptz) TO authenticated;