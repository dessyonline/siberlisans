
CREATE TABLE public.manual_revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  amount_try numeric(12,2) NOT NULL,
  cost_try numeric(12,2) NOT NULL DEFAULT 0,
  label text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_revenue_entries TO authenticated;
GRANT ALL ON public.manual_revenue_entries TO service_role;
ALTER TABLE public.manual_revenue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage manual revenue"
ON public.manual_revenue_entries FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_manual_revenue_updated_at
BEFORE UPDATE ON public.manual_revenue_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_manual_revenue_occurred_at ON public.manual_revenue_entries (occurred_at DESC);

-- ---------- RPCs ----------
CREATE OR REPLACE FUNCTION public.admin_add_manual_revenue(
  _amount numeric, _label text, _occurred_at timestamptz DEFAULT now(),
  _cost numeric DEFAULT 0, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF _amount IS NULL OR _amount = 0 THEN RAISE EXCEPTION 'Tutar geçersiz'; END IF;
  IF _label IS NULL OR btrim(_label) = '' THEN RAISE EXCEPTION 'Açıklama zorunlu'; END IF;
  INSERT INTO public.manual_revenue_entries(occurred_at, amount_try, cost_try, label, note, created_by)
  VALUES (COALESCE(_occurred_at, now()), _amount, COALESCE(_cost,0), btrim(_label), _note, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_manual_revenue(_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  DELETE FROM public.manual_revenue_entries WHERE id = _id;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_manual_revenue(_from timestamptz DEFAULT (now() - interval '90 days'), _to timestamptz DEFAULT (now() + interval '1 day'))
RETURNS TABLE(id uuid, occurred_at timestamptz, amount_try numeric, cost_try numeric, label text, note text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  SELECT m.id, m.occurred_at, m.amount_try, m.cost_try, m.label, m.note, m.created_at
  FROM public.manual_revenue_entries m
  WHERE m.occurred_at >= _from AND m.occurred_at < _to
  ORDER BY m.occurred_at DESC;
END; $$;

-- ---------- Reports include manual revenue ----------
CREATE OR REPLACE FUNCTION public.admin_daily_revenue(_days integer DEFAULT 30)
RETURNS TABLE(day date, revenue numeric, orders integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  WITH disc AS (
    SELECT order_id, COALESCE(SUM(discount_try),0)::numeric AS d
    FROM public.order_discounts GROUP BY order_id
  ),
  days AS (
    SELECT generate_series(
      date_trunc('day', now() - (_days || ' days')::interval),
      date_trunc('day', now()), interval '1 day') AS d
  ),
  ord AS (
    SELECT date_trunc('day', o.approved_at) AS d,
           SUM(GREATEST(COALESCE(o.price_try,0) - COALESCE(dc.d,0),0)) AS rev,
           COUNT(*) AS cnt
    FROM public.orders o
    LEFT JOIN disc dc ON dc.order_id = o.id
    WHERE o.status = 'approved' AND o.approved_at IS NOT NULL
    GROUP BY 1
  ),
  man AS (
    SELECT date_trunc('day', m.occurred_at) AS d,
           SUM(m.amount_try) AS rev, COUNT(*) AS cnt
    FROM public.manual_revenue_entries m GROUP BY 1
  )
  SELECT days.d::date,
         COALESCE(ord.rev,0) + COALESCE(man.rev,0),
         (COALESCE(ord.cnt,0) + COALESCE(man.cnt,0))::int
  FROM days
  LEFT JOIN ord ON ord.d = days.d
  LEFT JOIN man ON man.d = days.d
  ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS TABLE(today_revenue numeric, today_orders integer, week_revenue numeric, week_orders integer, month_revenue numeric, month_orders integer, pending_count integer, reviewing_count integer, avg_basket numeric, users_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  WITH disc AS (
    SELECT order_id, COALESCE(SUM(discount_try),0)::numeric AS d
    FROM public.order_discounts GROUP BY order_id
  ),
  o AS (
    SELECT ord.id, ord.status::text AS status, ord.approved_at,
           GREATEST(COALESCE(ord.price_try,0) - COALESCE(dc.d,0), 0)::numeric AS net_price
    FROM public.orders ord
    LEFT JOIN disc dc ON dc.order_id = ord.id
  ),
  m AS (SELECT occurred_at, amount_try FROM public.manual_revenue_entries)
  SELECT
    COALESCE((SELECT SUM(net_price) FROM o WHERE status='approved' AND approved_at >= date_trunc('day', now())),0)
      + COALESCE((SELECT SUM(amount_try) FROM m WHERE occurred_at >= date_trunc('day', now())),0),
    (COALESCE((SELECT COUNT(*) FROM o WHERE status='approved' AND approved_at >= date_trunc('day', now())),0)
      + COALESCE((SELECT COUNT(*) FROM m WHERE occurred_at >= date_trunc('day', now())),0))::int,
    COALESCE((SELECT SUM(net_price) FROM o WHERE status='approved' AND approved_at >= now() - interval '7 days'),0)
      + COALESCE((SELECT SUM(amount_try) FROM m WHERE occurred_at >= now() - interval '7 days'),0),
    (COALESCE((SELECT COUNT(*) FROM o WHERE status='approved' AND approved_at >= now() - interval '7 days'),0)
      + COALESCE((SELECT COUNT(*) FROM m WHERE occurred_at >= now() - interval '7 days'),0))::int,
    COALESCE((SELECT SUM(net_price) FROM o WHERE status='approved' AND approved_at >= now() - interval '30 days'),0)
      + COALESCE((SELECT SUM(amount_try) FROM m WHERE occurred_at >= now() - interval '30 days'),0),
    (COALESCE((SELECT COUNT(*) FROM o WHERE status='approved' AND approved_at >= now() - interval '30 days'),0)
      + COALESCE((SELECT COUNT(*) FROM m WHERE occurred_at >= now() - interval '30 days'),0))::int,
    COALESCE((SELECT COUNT(*) FROM o WHERE status='pending'),0)::int,
    COALESCE((SELECT COUNT(*) FROM o WHERE status='reviewing'),0)::int,
    COALESCE((SELECT AVG(net_price) FROM o WHERE status='approved' AND approved_at >= now() - interval '30 days'),0),
    (SELECT COUNT(*)::int FROM public.profiles);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_profit_report(_from timestamp with time zone, _to timestamp with time zone, _granularity text DEFAULT 'day'::text)
RETURNS TABLE(bucket timestamp with time zone, orders_count bigint, revenue numeric, gross_revenue numeric, discount_total numeric, cost numeric, profit numeric, refunds numeric, topups numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  man AS (
    SELECT date_trunc(_granularity, m.occurred_at) AS bucket,
           COUNT(*)::bigint AS cnt,
           COALESCE(SUM(m.amount_try),0)::numeric AS revenue,
           COALESCE(SUM(m.cost_try),0)::numeric AS cost
    FROM public.manual_revenue_entries m
    WHERE m.occurred_at >= _from AND m.occurred_at < _to
    GROUP BY 1
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
  ),
  buckets AS (
    SELECT bucket FROM ord
    UNION SELECT bucket FROM man
    UNION SELECT bucket FROM tops
  )
  SELECT
    b.bucket,
    (COALESCE(ord.orders_count,0) + COALESCE(man.cnt,0))::bigint,
    COALESCE(ord.revenue,0) + COALESCE(man.revenue,0),
    COALESCE(ord.gross_revenue,0) + COALESCE(man.revenue,0),
    COALESCE(ord.discount_total,0),
    COALESCE(ord.cost,0) + COALESCE(man.cost,0),
    COALESCE(ord.profit,0) + (COALESCE(man.revenue,0) - COALESCE(man.cost,0)),
    COALESCE(ord.refunds,0),
    COALESCE(tops.topups,0)
  FROM buckets b
  LEFT JOIN ord ON ord.bucket = b.bucket
  LEFT JOIN man ON man.bucket = b.bucket
  LEFT JOIN tops ON tops.bucket = b.bucket
  ORDER BY 1;
END; $$;

-- ---------- Delivery repair ----------
CREATE OR REPLACE FUNCTION public.admin_repair_deliveries(_limit integer DEFAULT 200)
RETURNS TABLE(order_id uuid, reference_code text, outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r RECORD; v_key text; v_tok text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  FOR r IN
    SELECT o.id, o.reference_code
    FROM public.orders o
    JOIN public.products p ON p.id = o.product_id
    WHERE o.status = 'approved'
      AND COALESCE(p.manual_fulfillment,false) = false
      AND p.source <> 'uniquelisans'
      AND NOT EXISTS (SELECT 1 FROM public.order_keys ok WHERE ok.order_id = o.id)
    ORDER BY o.approved_at DESC
    LIMIT _limit
  LOOP
    BEGIN
      SELECT * INTO v_key, v_tok FROM public._assign_key_to_order(r.id);
      order_id := r.id; reference_code := r.reference_code;
      outcome := CASE WHEN v_key IS NULL THEN 'atlandi' ELSE 'teslim edildi' END;
    EXCEPTION WHEN OTHERS THEN
      order_id := r.id; reference_code := r.reference_code;
      outcome := 'hata: ' || SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
END; $$;

DO $$
DECLARE r RECORD; v_key text; v_tok text;
BEGIN
  FOR r IN
    SELECT o.id
    FROM public.orders o
    JOIN public.products p ON p.id = o.product_id
    WHERE o.status = 'approved'
      AND COALESCE(p.manual_fulfillment,false) = false
      AND p.source <> 'uniquelisans'
      AND NOT EXISTS (SELECT 1 FROM public.order_keys ok WHERE ok.order_id = o.id)
  LOOP
    BEGIN
      SELECT * INTO v_key, v_tok FROM public._assign_key_to_order(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip % : %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
