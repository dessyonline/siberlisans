CREATE OR REPLACE FUNCTION public.admin_profit_report(
  _from timestamptz,
  _to timestamptz,
  _granularity text DEFAULT 'day'
)
RETURNS TABLE(
  bucket timestamptz,
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
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _granularity NOT IN ('day','week','month') THEN RAISE EXCEPTION 'invalid granularity'; END IF;

  RETURN QUERY
  WITH discounts AS (
    SELECT od.order_id, COALESCE(SUM(od.discount_try), 0)::numeric AS amount
    FROM public.order_discounts od
    GROUP BY od.order_id
  ),
  item_costs AS (
    SELECT oi.order_id,
           COALESCE(SUM(oi.quantity * COALESCE(p.cost_try, p.external_price, 0)), 0)::numeric AS amount
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    GROUP BY oi.order_id
  ),
  scoped AS (
    SELECT
      date_trunc(_granularity, COALESCE(o.approved_at, o.created_at)) AS bucket,
      o.id,
      COALESCE(o.price_try, 0)::numeric AS gross,
      LEAST(COALESCE(d.amount, 0), COALESCE(o.price_try, 0))::numeric AS discount,
      GREATEST(COALESCE(o.price_try, 0) - COALESCE(d.amount, 0), 0)::numeric AS net_revenue,
      CASE
        WHEN COALESCE(ic.amount, 0) > 0 THEN ic.amount
        ELSE COALESCE(op.cost_try, op.external_price, 0)
      END::numeric AS order_cost,
      o.status::text AS status
    FROM public.orders o
    LEFT JOIN discounts d ON d.order_id = o.id
    LEFT JOIN item_costs ic ON ic.order_id = o.id
    LEFT JOIN public.products op ON op.id = o.product_id
    WHERE COALESCE(o.approved_at, o.created_at) >= _from
      AND COALESCE(o.approved_at, o.created_at) < _to
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = o.user_id AND ur.role = 'admin'
      )
  ),
  ord AS (
    SELECT
      s.bucket,
      COUNT(*) FILTER (WHERE s.status = 'approved')::bigint AS orders_count,
      COALESCE(SUM(s.net_revenue) FILTER (WHERE s.status = 'approved'), 0)::numeric AS revenue,
      COALESCE(SUM(s.gross) FILTER (WHERE s.status = 'approved'), 0)::numeric AS gross_revenue,
      COALESCE(SUM(s.discount) FILTER (WHERE s.status = 'approved'), 0)::numeric AS discount_total,
      COALESCE(SUM(s.order_cost) FILTER (WHERE s.status = 'approved'), 0)::numeric AS cost,
      COALESCE(SUM(s.net_revenue - s.order_cost) FILTER (WHERE s.status = 'approved'), 0)::numeric AS profit,
      COALESCE(SUM(s.net_revenue) FILTER (WHERE s.status IN ('cancelled','rejected','failed')), 0)::numeric AS refunds
    FROM scoped s
    GROUP BY s.bucket
  ),
  man AS (
    SELECT date_trunc(_granularity, m.occurred_at) AS bucket,
           COUNT(*)::bigint AS cnt,
           COALESCE(SUM(m.amount_try), 0)::numeric AS revenue,
           COALESCE(SUM(m.cost_try), 0)::numeric AS cost
    FROM public.manual_revenue_entries m
    WHERE m.occurred_at >= _from AND m.occurred_at < _to
    GROUP BY 1
  ),
  tops AS (
    SELECT date_trunc(_granularity, COALESCE(wt.approved_at, wt.updated_at)) AS bucket,
           COALESCE(SUM(wt.amount_try), 0)::numeric AS topups
    FROM public.wallet_topups wt
    WHERE wt.status::text = 'approved'
      AND COALESCE(wt.approved_at, wt.updated_at) >= _from
      AND COALESCE(wt.approved_at, wt.updated_at) < _to
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = wt.user_id AND ur.role = 'admin'
      )
    GROUP BY 1
  ),
  buckets AS (
    SELECT o.bucket FROM ord o
    UNION SELECT m.bucket FROM man m
    UNION SELECT t.bucket FROM tops t
  )
  SELECT
    b.bucket,
    COALESCE(o.orders_count, 0)::bigint,
    COALESCE(o.revenue, 0) + COALESCE(m.revenue, 0),
    COALESCE(o.gross_revenue, 0) + COALESCE(m.revenue, 0),
    COALESCE(o.discount_total, 0),
    COALESCE(o.cost, 0) + COALESCE(m.cost, 0),
    COALESCE(o.profit, 0) + COALESCE(m.revenue, 0) - COALESCE(m.cost, 0),
    COALESCE(o.refunds, 0),
    COALESCE(t.topups, 0)
  FROM buckets b
  LEFT JOIN ord o ON o.bucket = b.bucket
  LEFT JOIN man m ON m.bucket = b.bucket
  LEFT JOIN tops t ON t.bucket = b.bucket
  ORDER BY b.bucket;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_profit_by_product(
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(
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
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  WITH discounts AS (
    SELECT od.order_id, COALESCE(SUM(od.discount_try), 0)::numeric AS amount
    FROM public.order_discounts od GROUP BY od.order_id
  ),
  lines AS (
    SELECT o.id AS order_id,
           oi.product_id,
           oi.quantity::numeric AS quantity,
           (oi.quantity * oi.unit_price_try)::numeric AS gross,
           COALESCE(p.cost_try, p.external_price, 0)::numeric AS unit_cost
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE o.status = 'approved'
      AND COALESCE(o.approved_at, o.created_at) >= _from
      AND COALESCE(o.approved_at, o.created_at) < _to
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = o.user_id AND ur.role = 'admin')
    UNION ALL
    SELECT o.id,
           o.product_id,
           1::numeric,
           COALESCE(o.price_try, 0)::numeric,
           COALESCE(p.cost_try, p.external_price, 0)::numeric
    FROM public.orders o
    LEFT JOIN public.products p ON p.id = o.product_id
    WHERE o.status = 'approved'
      AND o.product_id IS NOT NULL
      AND COALESCE(o.approved_at, o.created_at) >= _from
      AND COALESCE(o.approved_at, o.created_at) < _to
      AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = o.user_id AND ur.role = 'admin')
  ),
  totals AS (
    SELECT l.order_id, SUM(l.gross)::numeric AS gross
    FROM lines l GROUP BY l.order_id
  ),
  allocated AS (
    SELECT l.product_id,
           l.quantity,
           CASE WHEN t.gross > 0
             THEN l.gross - LEAST(COALESCE(d.amount, 0), t.gross) * (l.gross / t.gross)
             ELSE 0 END::numeric AS net_revenue,
           (l.quantity * l.unit_cost)::numeric AS line_cost
    FROM lines l
    JOIN totals t ON t.order_id = l.order_id
    LEFT JOIN discounts d ON d.order_id = l.order_id
  )
  SELECT p.id,
         p.name,
         COALESCE(SUM(a.quantity), 0)::bigint,
         COALESCE(SUM(a.net_revenue), 0)::numeric,
         COALESCE(SUM(a.line_cost), 0)::numeric,
         COALESCE(SUM(a.net_revenue - a.line_cost), 0)::numeric
  FROM allocated a
  JOIN public.products p ON p.id = a.product_id
  GROUP BY p.id, p.name
  ORDER BY 6 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_financials(_days integer DEFAULT 14)
RETURNS TABLE(
  total_revenue numeric,
  today_revenue numeric,
  total_cost numeric,
  total_profit numeric,
  discount_total numeric,
  approved_orders bigint,
  chart jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  WITH discounts AS (
    SELECT od.order_id, COALESCE(SUM(od.discount_try), 0)::numeric AS amount
    FROM public.order_discounts od GROUP BY od.order_id
  ),
  item_costs AS (
    SELECT oi.order_id,
           COALESCE(SUM(oi.quantity * COALESCE(p.cost_try, p.external_price, 0)), 0)::numeric AS amount
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    GROUP BY oi.order_id
  ),
  ord AS (
    SELECT date_trunc('day', COALESCE(o.approved_at, o.created_at))::date AS day,
           GREATEST(COALESCE(o.price_try,0) - COALESCE(d.amount,0),0)::numeric AS revenue,
           LEAST(COALESCE(d.amount,0),COALESCE(o.price_try,0))::numeric AS discount,
           CASE WHEN COALESCE(ic.amount,0) > 0 THEN ic.amount ELSE COALESCE(p.cost_try,p.external_price,0) END::numeric AS cost
    FROM public.orders o
    LEFT JOIN discounts d ON d.order_id=o.id
    LEFT JOIN item_costs ic ON ic.order_id=o.id
    LEFT JOIN public.products p ON p.id=o.product_id
    WHERE o.status='approved'
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=o.user_id AND ur.role='admin')
  ),
  man AS (
    SELECT date_trunc('day',m.occurred_at)::date AS day, m.amount_try::numeric AS revenue, m.cost_try::numeric AS cost
    FROM public.manual_revenue_entries m
  ),
  combined AS (
    SELECT day,revenue,cost,discount,1::bigint AS orders FROM ord
    UNION ALL
    SELECT day,revenue,cost,0::numeric,0::bigint FROM man
  ),
  days AS (
    SELECT generate_series(current_date-GREATEST(_days-1,0),current_date,'1 day')::date AS day
  ),
  daily AS (
    SELECT d.day,
           COALESCE(SUM(c.revenue),0)::numeric AS revenue,
           COALESCE(SUM(c.cost),0)::numeric AS cost,
           COALESCE(SUM(c.discount),0)::numeric AS discount,
           COALESCE(SUM(c.orders),0)::bigint AS orders
    FROM days d LEFT JOIN combined c ON c.day=d.day GROUP BY d.day ORDER BY d.day
  )
  SELECT
    COALESCE((SELECT SUM(revenue) FROM combined),0)::numeric,
    COALESCE((SELECT SUM(revenue) FROM combined WHERE day=current_date),0)::numeric,
    COALESCE((SELECT SUM(cost) FROM combined),0)::numeric,
    COALESCE((SELECT SUM(revenue-cost) FROM combined),0)::numeric,
    COALESCE((SELECT SUM(discount) FROM combined),0)::numeric,
    COALESCE((SELECT SUM(orders) FROM combined),0)::bigint,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date',to_char(day,'MM-DD'),'revenue',revenue,'cost',cost,'profit',revenue-cost) ORDER BY day) FROM daily),'[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_financials(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_financials(integer) TO service_role;