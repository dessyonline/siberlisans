
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'cancelled';

CREATE OR REPLACE FUNCTION public.admin_cancel_order(_order_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid; v_status text; v_paid text; v_refunded numeric := 0;
  v_released int := 0; v_already int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT user_id, status::text, paid_with INTO v_owner, v_status, v_paid
    FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'Sipariş zaten iptal/red'; END IF;

  IF v_paid = 'wallet' THEN
    SELECT COUNT(*) INTO v_already FROM public.wallet_transactions
      WHERE order_id = _order_id AND kind = 'refund';
    IF v_already = 0 THEN
      v_refunded := COALESCE(public.refund_order_to_wallet(_order_id), 0);
    END IF;
  END IF;

  UPDATE public.license_keys
     SET status = 'available', assigned_order_id = NULL, assigned_at = NULL,
         claimed_at = NULL, activation_token = NULL, hwid = NULL,
         activated_at = NULL, expires_at = NULL, revoked = false
   WHERE assigned_order_id = _order_id;
  GET DIAGNOSTICS v_released = ROW_COUNT;

  DELETE FROM public.order_keys WHERE order_id = _order_id;

  UPDATE public.orders
     SET status = 'cancelled',
         admin_note = COALESCE(_note, admin_note),
         updated_at = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'refunded_try', v_refunded, 'released_keys', v_released);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_order(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_profit_report(timestamp with time zone, timestamp with time zone, text);

CREATE OR REPLACE FUNCTION public.admin_profit_report(_from timestamp with time zone, _to timestamp with time zone, _granularity text DEFAULT 'day')
RETURNS TABLE(
  bucket timestamp with time zone,
  orders_count bigint,
  revenue numeric,
  gross_revenue numeric,
  discount_total numeric,
  cost numeric,
  profit numeric,
  refunds numeric,
  topups numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH disc AS (
    SELECT order_id, COALESCE(SUM(discount_try),0)::numeric AS d
    FROM public.order_discounts GROUP BY order_id
  ),
  scoped AS (
    SELECT
      date_trunc(_granularity, o.created_at) AS bucket,
      o.id AS order_id,
      COALESCE(o.price_try,0)::numeric AS gross,
      COALESCE(d.d,0)::numeric AS discount,
      GREATEST(COALESCE(o.price_try,0) - COALESCE(d.d,0), 0)::numeric AS net_revenue,
      COALESCE(SUM(oi.qty * COALESCE(p.external_price, 0)), 0)::numeric AS cost,
      o.status::text AS status
    FROM public.orders o
    LEFT JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN disc d ON d.order_id = o.id
    WHERE o.created_at >= _from AND o.created_at < _to
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = o.user_id AND ur.role = 'admin')
    GROUP BY o.id, o.created_at, o.price_try, o.status, d.d
  ),
  ord AS (
    SELECT
      s.bucket,
      COUNT(*) FILTER (WHERE s.status IN ('approved','completed','delivered','paid'))::bigint AS orders_count,
      COALESCE(SUM(s.net_revenue) FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS revenue,
      COALESCE(SUM(s.gross)       FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS gross_revenue,
      COALESCE(SUM(s.discount)    FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS discount_total,
      COALESCE(SUM(s.cost)        FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS cost,
      COALESCE(SUM(s.net_revenue - s.cost) FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS profit,
      COALESCE(SUM(s.net_revenue) FILTER (WHERE s.status IN ('refunded','cancelled','rejected','failed')), 0) AS refunds
    FROM scoped s GROUP BY s.bucket
  ),
  tops AS (
    SELECT date_trunc(_granularity, COALESCE(wt.approved_at, wt.updated_at)) AS bucket,
           COALESCE(SUM(wt.amount_try),0)::numeric AS topups
    FROM public.wallet_topups wt
    WHERE wt.status::text = 'approved'
      AND COALESCE(wt.approved_at, wt.updated_at) >= _from
      AND COALESCE(wt.approved_at, wt.updated_at) < _to
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = wt.user_id AND ur.role = 'admin')
    GROUP BY 1
  )
  SELECT
    COALESCE(ord.bucket, tops.bucket) AS bucket,
    COALESCE(ord.orders_count, 0)::bigint,
    COALESCE(ord.revenue, 0),
    COALESCE(ord.gross_revenue, 0),
    COALESCE(ord.discount_total, 0),
    COALESCE(ord.cost, 0),
    COALESCE(ord.profit, 0),
    COALESCE(ord.refunds, 0),
    COALESCE(tops.topups, 0)
  FROM ord FULL OUTER JOIN tops ON tops.bucket = ord.bucket
  ORDER BY 1;
END;
$$;
