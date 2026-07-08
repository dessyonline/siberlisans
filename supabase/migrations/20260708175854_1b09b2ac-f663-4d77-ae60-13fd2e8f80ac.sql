-- 1) Enum: kullanıcı seviyesi
DO $$ BEGIN
  CREATE TYPE public.user_tier AS ENUM ('bronze','silver','gold','platinum');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) profiles kolonları
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier public.user_tier NOT NULL DEFAULT 'bronze';

-- 3) products.cost_try (karlılık için)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_try NUMERIC(12,2);

-- 4) Ledger tablosu
CREATE TABLE IF NOT EXISTS public.user_points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON public.user_points_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_order ON public.user_points_ledger(order_id);

GRANT SELECT ON public.user_points_ledger TO authenticated;
GRANT ALL ON public.user_points_ledger TO service_role;
ALTER TABLE public.user_points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_ledger_read" ON public.user_points_ledger;
CREATE POLICY "own_ledger_read" ON public.user_points_ledger
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- 5) Seviye hesaplayıcı
CREATE OR REPLACE FUNCTION public.compute_tier(_points INTEGER)
RETURNS public.user_tier
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _points >= 5000 THEN 'platinum'::public.user_tier
    WHEN _points >= 2000 THEN 'gold'::public.user_tier
    WHEN _points >= 500  THEN 'silver'::public.user_tier
    ELSE 'bronze'::public.user_tier
  END;
$$;

-- 6) Puan verme (server-side helper)
CREATE OR REPLACE FUNCTION public.award_points(
  _user_id UUID, _delta INTEGER, _reason TEXT, _order_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_new INTEGER;
BEGIN
  IF _delta = 0 THEN
    SELECT total_points INTO v_new FROM public.profiles WHERE id = _user_id;
    RETURN COALESCE(v_new,0);
  END IF;
  UPDATE public.profiles
    SET total_points = GREATEST(0, total_points + _delta),
        tier = public.compute_tier(GREATEST(0, total_points + _delta))
    WHERE id = _user_id
    RETURNING total_points INTO v_new;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'profil bulunamadı';
  END IF;
  INSERT INTO public.user_points_ledger(user_id, delta, reason, order_id, balance_after)
    VALUES (_user_id, _delta, _reason, _order_id, v_new);
  RETURN v_new;
END; $$;

-- 7) Puan harcama (sepet indirimi için)
CREATE OR REPLACE FUNCTION public.spend_points(
  _amount INTEGER, _order_id UUID
) RETURNS TABLE(discount_try NUMERIC, balance_after INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_bal INTEGER;
  v_order public.orders%ROWTYPE;
  v_max_disc NUMERIC(12,2);
  v_disc NUMERIC(12,2);
  v_new INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Geçersiz puan miktarı'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_order.status NOT IN ('pending','reviewing') THEN
    RAISE EXCEPTION 'Bu aşamada puan kullanılamaz';
  END IF;

  SELECT total_points INTO v_bal FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF COALESCE(v_bal,0) < _amount THEN RAISE EXCEPTION 'Yetersiz puan'; END IF;

  v_max_disc := ROUND(v_order.price_try * 0.30, 2);
  v_disc := LEAST(_amount / 100.0, v_max_disc);
  IF v_disc <= 0 THEN RAISE EXCEPTION 'İndirim uygulanamıyor'; END IF;

  -- Puan indirimi order_discounts'a yazılır (mevcut kupon akışıyla aynı sütun)
  INSERT INTO public.order_discounts(order_id, code_snapshot, discount_try)
    VALUES (_order_id, 'PUAN-' || _amount, v_disc)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles
    SET total_points = total_points - _amount,
        tier = public.compute_tier(total_points - _amount)
    WHERE id = v_uid RETURNING total_points INTO v_new;

  INSERT INTO public.user_points_ledger(user_id, delta, reason, order_id, balance_after)
    VALUES (v_uid, -_amount, 'sepet indirimi', _order_id, v_new);

  discount_try := v_disc;
  balance_after := v_new;
  RETURN NEXT;
END; $$;

-- 8) Sipariş onaylandığında puan ver (trigger)
CREATE OR REPLACE FUNCTION public.tg_award_points_on_approve()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_delta INTEGER;
  v_first BOOLEAN;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.user_id IS NOT NULL THEN
    v_delta := FLOOR(COALESCE(NEW.price_try,0) / 10.0)::int;

    -- ilk sipariş bonusu
    SELECT NOT EXISTS(
      SELECT 1 FROM public.orders
      WHERE user_id = NEW.user_id AND status = 'approved' AND id <> NEW.id
    ) INTO v_first;
    IF v_first THEN v_delta := v_delta + 50; END IF;

    IF v_delta > 0 THEN
      PERFORM public.award_points(NEW.user_id, v_delta,
        CASE WHEN v_first THEN 'ilk sipariş + sipariş puanı' ELSE 'sipariş puanı' END,
        NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_award_points_on_approve ON public.orders;
CREATE TRIGGER trg_award_points_on_approve
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_award_points_on_approve();

-- 9) Yorum yazınca +20 puan
CREATE OR REPLACE FUNCTION public.tg_award_points_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.award_points(NEW.user_id, 20, 'ürün yorumu', NULL);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_award_points_on_review ON public.product_reviews;
CREATE TRIGGER trg_award_points_on_review
  AFTER INSERT ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_award_points_on_review();

-- 10) Admin dashboard için özet RPC
CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS TABLE(
  today_revenue NUMERIC, today_orders INTEGER,
  week_revenue NUMERIC, week_orders INTEGER,
  month_revenue NUMERIC, month_orders INTEGER,
  pending_count INTEGER, reviewing_count INTEGER,
  avg_basket NUMERIC, users_count INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(SUM(price_try) FILTER (WHERE status='approved' AND approved_at >= date_trunc('day', now())),0),
    COALESCE(COUNT(*) FILTER (WHERE status='approved' AND approved_at >= date_trunc('day', now())),0)::int,
    COALESCE(SUM(price_try) FILTER (WHERE status='approved' AND approved_at >= now() - interval '7 days'),0),
    COALESCE(COUNT(*) FILTER (WHERE status='approved' AND approved_at >= now() - interval '7 days'),0)::int,
    COALESCE(SUM(price_try) FILTER (WHERE status='approved' AND approved_at >= now() - interval '30 days'),0),
    COALESCE(COUNT(*) FILTER (WHERE status='approved' AND approved_at >= now() - interval '30 days'),0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status='pending'),0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status='reviewing'),0)::int,
    COALESCE(AVG(price_try) FILTER (WHERE status='approved' AND approved_at >= now() - interval '30 days'),0),
    (SELECT COUNT(*)::int FROM public.profiles)
  FROM public.orders;
END; $$;

-- 11) Son 30 gün günlük ciro (trend grafiği için)
CREATE OR REPLACE FUNCTION public.admin_daily_revenue(_days INTEGER DEFAULT 30)
RETURNS TABLE(day DATE, revenue NUMERIC, orders INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  SELECT d::date AS day,
    COALESCE(SUM(o.price_try),0) AS revenue,
    COALESCE(COUNT(o.id),0)::int AS orders
  FROM generate_series(
    date_trunc('day', now() - (_days || ' days')::interval),
    date_trunc('day', now()), interval '1 day'
  ) AS d
  LEFT JOIN public.orders o
    ON o.status = 'approved'
   AND date_trunc('day', o.approved_at) = d
  GROUP BY d ORDER BY d;
END; $$;

-- 12) Ürün karlılık raporu
CREATE OR REPLACE FUNCTION public.admin_product_profitability(_days INTEGER DEFAULT 30)
RETURNS TABLE(
  product_id UUID, name TEXT, sold INTEGER,
  revenue NUMERIC, cost NUMERIC, profit NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  WITH sales AS (
    SELECT COALESCE(oi.product_id, o.product_id) AS pid,
           COALESCE(oi.quantity, 1) AS qty,
           COALESCE(oi.unit_price_try, o.price_try) AS unit_price
    FROM public.orders o
    LEFT JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.status='approved' AND o.approved_at >= now() - (_days || ' days')::interval
  )
  SELECT p.id, p.name,
    COALESCE(SUM(s.qty),0)::int AS sold,
    COALESCE(SUM(s.qty * s.unit_price),0) AS revenue,
    COALESCE(SUM(s.qty * COALESCE(p.cost_try,0)),0) AS cost,
    COALESCE(SUM(s.qty * (s.unit_price - COALESCE(p.cost_try,0))),0) AS profit
  FROM public.products p
  LEFT JOIN sales s ON s.pid = p.id
  GROUP BY p.id, p.name
  HAVING COALESCE(SUM(s.qty),0) > 0
  ORDER BY profit DESC;
END; $$;