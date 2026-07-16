
CREATE OR REPLACE FUNCTION public.admin_profit_report(_from timestamp with time zone, _to timestamp with time zone, _granularity text DEFAULT 'day'::text)
 RETURNS TABLE(bucket timestamp with time zone, orders_count bigint, revenue numeric, cost numeric, profit numeric, refunds numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = o.user_id AND ur.role = 'admin'
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_profit_by_product(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(product_id uuid, product_name text, qty_sold bigint, revenue numeric, cost numeric, profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = o.user_id AND ur.role = 'admin'
    )
  GROUP BY p.id, p.name
  ORDER BY profit DESC;
END;
$function$;
