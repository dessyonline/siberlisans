
CREATE OR REPLACE FUNCTION public.admin_profit_report(_from timestamp with time zone, _to timestamp with time zone, _granularity text DEFAULT 'day')
 RETURNS TABLE(bucket timestamp with time zone, orders_count bigint, revenue numeric, cost numeric, profit numeric, refunds numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
      GREATEST(COALESCE(o.price_try,0) - COALESCE(d.d,0), 0)::numeric AS revenue,
      COALESCE(SUM(oi.qty * COALESCE(p.external_price, 0)), 0)::numeric AS cost,
      o.status::text AS status
    FROM public.orders o
    LEFT JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN disc d ON d.order_id = o.id
    WHERE o.created_at >= _from AND o.created_at < _to
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = o.user_id AND ur.role = 'admin')
    GROUP BY o.id, o.created_at, o.price_try, o.status, d.d
  )
  SELECT
    s.bucket,
    COUNT(*) FILTER (WHERE s.status IN ('approved','completed','delivered','paid'))::bigint AS orders_count,
    COALESCE(SUM(s.revenue) FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS revenue,
    COALESCE(SUM(s.cost)    FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS cost,
    COALESCE(SUM(s.revenue - s.cost) FILTER (WHERE s.status IN ('approved','completed','delivered','paid')), 0) AS profit,
    COALESCE(SUM(s.revenue) FILTER (WHERE s.status IN ('refunded','cancelled','rejected','failed')), 0) AS refunds
  FROM scoped s GROUP BY s.bucket ORDER BY s.bucket;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_profit_by_product(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(product_id uuid, product_name text, qty_sold bigint, revenue numeric, cost numeric, profit numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH order_totals AS (
    -- Her sipariş için: brüt (satır kalemi toplamı) ve toplam indirim
    SELECT o.id AS order_id,
           COALESCE(SUM(oi.qty * oi.unit_price_try), 0)::numeric AS gross,
           COALESCE((SELECT SUM(discount_try) FROM public.order_discounts od WHERE od.order_id = o.id), 0)::numeric AS discount
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.created_at >= _from AND o.created_at < _to
      AND o.status::text IN ('approved','completed','delivered','paid')
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = o.user_id AND ur.role = 'admin')
    GROUP BY o.id
  ),
  allocated AS (
    -- İndirimi sipariş içindeki kalemlere brüt oranında dağıt
    SELECT
      oi.product_id,
      oi.qty,
      oi.unit_price_try,
      CASE WHEN ot.gross > 0
           THEN (oi.qty * oi.unit_price_try) - ot.discount * ((oi.qty * oi.unit_price_try) / ot.gross)
           ELSE oi.qty * oi.unit_price_try END::numeric AS net_revenue
    FROM public.order_items oi
    JOIN order_totals ot ON ot.order_id = oi.order_id
  )
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    COALESCE(SUM(a.qty), 0)::bigint AS qty_sold,
    COALESCE(SUM(a.net_revenue), 0)::numeric AS revenue,
    COALESCE(SUM(a.qty * COALESCE(p.external_price, 0)), 0)::numeric AS cost,
    COALESCE(SUM(a.net_revenue - a.qty * COALESCE(p.external_price, 0)), 0)::numeric AS profit
  FROM allocated a
  JOIN public.products p ON p.id = a.product_id
  GROUP BY p.id, p.name
  ORDER BY profit DESC;
END;
$function$;
