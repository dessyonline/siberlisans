
-- Add season & active columns to badges
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS season text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Personal coupon flag (puan→kupon conversion)
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

-- Missions catalog
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '🎯',
  rule_key text NOT NULL,
  target integer NOT NULL DEFAULT 1,
  reward_points integer NOT NULL DEFAULT 50,
  season text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.missions TO anon, authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missions readable by all" ON public.missions FOR SELECT USING (is_active = true);
CREATE POLICY "admin manage missions" ON public.missions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Per-user mission state
CREATE TABLE IF NOT EXISTS public.user_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_id)
);
GRANT SELECT, INSERT, UPDATE ON public.user_missions TO authenticated;
GRANT ALL ON public.user_missions TO service_role;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own missions" ON public.user_missions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user updates own missions" ON public.user_missions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "system inserts missions" ON public.user_missions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Compute mission progress for a rule_key
CREATE OR REPLACE FUNCTION public.compute_mission_progress(_user_id uuid, _rule_key text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v integer := 0;
BEGIN
  CASE _rule_key
    WHEN 'first_order' THEN
      SELECT count(*) INTO v FROM public.orders WHERE user_id = _user_id AND status IN ('approved','delivered');
    WHEN 'spend_500' THEN
      SELECT COALESCE(sum(total_try),0)::int INTO v FROM public.orders WHERE user_id = _user_id AND status IN ('approved','delivered');
    WHEN 'spend_2000' THEN
      SELECT COALESCE(sum(total_try),0)::int INTO v FROM public.orders WHERE user_id = _user_id AND status IN ('approved','delivered');
    WHEN 'first_review' THEN
      SELECT count(*) INTO v FROM public.product_reviews WHERE user_id = _user_id;
    WHEN 'three_reviews' THEN
      SELECT count(*) INTO v FROM public.product_reviews WHERE user_id = _user_id;
    WHEN 'five_favorites' THEN
      SELECT count(*) INTO v FROM public.favorites WHERE user_id = _user_id;
    WHEN 'refer_one' THEN
      SELECT count(*) INTO v FROM public.profiles WHERE referred_by = _user_id;
    WHEN 'streak_3' THEN
      SELECT COALESCE(login_streak,0) INTO v FROM public.profiles WHERE id = _user_id;
    WHEN 'streak_7' THEN
      SELECT COALESCE(login_streak,0) INTO v FROM public.profiles WHERE id = _user_id;
    ELSE
      v := 0;
  END CASE;
  RETURN COALESCE(v,0);
END;
$$;

-- Claim a mission: computes progress; if >= target, awards points once
CREATE OR REPLACE FUNCTION public.claim_mission(_mission_id uuid)
RETURNS TABLE(awarded integer, progress integer, target integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  m public.missions%ROWTYPE;
  cur integer;
  new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO m FROM public.missions WHERE id = _mission_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'mission not found'; END IF;

  cur := public.compute_mission_progress(_uid, m.rule_key);

  INSERT INTO public.user_missions(user_id, mission_id, progress)
  VALUES (_uid, m.id, cur)
  ON CONFLICT (user_id, mission_id) DO UPDATE SET progress = EXCLUDED.progress;

  IF cur < m.target THEN
    RETURN QUERY SELECT 0, cur, m.target;
    RETURN;
  END IF;

  -- Award only once
  UPDATE public.user_missions
    SET completed_at = COALESCE(completed_at, now()),
        claimed_at   = now()
    WHERE user_id = _uid AND mission_id = m.id AND claimed_at IS NULL;

  IF NOT FOUND THEN
    -- Already claimed
    RETURN QUERY SELECT 0, cur, m.target;
    RETURN;
  END IF;

  UPDATE public.profiles
    SET total_points = COALESCE(total_points,0) + m.reward_points
    WHERE id = _uid
    RETURNING total_points INTO new_balance;

  INSERT INTO public.user_points_ledger(user_id, delta, reason, balance_after)
  VALUES (_uid, m.reward_points, 'mission:'||m.key, new_balance);

  RETURN QUERY SELECT m.reward_points, cur, m.target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_mission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_mission_progress(uuid, text) TO authenticated;

-- Points → coupon conversion
CREATE OR REPLACE FUNCTION public.redeem_points_for_coupon(_points integer)
RETURNS TABLE(coupon_code text, discount_try numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  cur_points integer;
  disc numeric;
  code text;
  new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _points NOT IN (500, 1000, 2000) THEN
    RAISE EXCEPTION 'geçersiz puan miktarı';
  END IF;
  disc := CASE _points WHEN 500 THEN 10 WHEN 1000 THEN 25 WHEN 2000 THEN 60 END;

  SELECT COALESCE(total_points,0) INTO cur_points FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF cur_points < _points THEN RAISE EXCEPTION 'yetersiz puan'; END IF;

  UPDATE public.profiles SET total_points = cur_points - _points WHERE id = _uid RETURNING total_points INTO new_balance;
  INSERT INTO public.user_points_ledger(user_id, delta, reason, balance_after)
  VALUES (_uid, -_points, 'redeem:coupon_'||_points, new_balance);

  code := 'PT-' || upper(substr(replace(_uid::text,'-',''),1,4)) || '-' || upper(substr(md5(random()::text||clock_timestamp()::text),1,6));

  INSERT INTO public.coupons(code, discount_type, discount_value, min_order_try, max_uses, used_count, expires_at, is_active, user_id, is_personal)
  VALUES (code, 'fixed', disc, disc * 3, 1, 0, now() + interval '60 days', true, _uid, true);

  RETURN QUERY SELECT code, disc;
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_points_for_coupon(integer) TO authenticated;

-- Monthly leaderboard (public)
CREATE OR REPLACE FUNCTION public.monthly_leaderboard()
RETURNS TABLE(
  rank integer,
  user_id uuid,
  display_masked text,
  tier text,
  points_earned integer,
  avatar_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT l.user_id, SUM(l.delta)::int AS pts
    FROM public.user_points_ledger l
    WHERE l.delta > 0
      AND l.created_at >= date_trunc('month', now())
    GROUP BY l.user_id
  )
  SELECT
    (ROW_NUMBER() OVER (ORDER BY a.pts DESC))::int AS rank,
    a.user_id,
    CASE
      WHEN p.display_name IS NOT NULL AND length(p.display_name) > 2
        THEN substr(p.display_name,1,2) || repeat('*', greatest(length(p.display_name)-2, 1))
      ELSE 'kullanıcı'
    END AS display_masked,
    COALESCE(p.tier::text,'bronze'),
    a.pts,
    p.avatar_id
  FROM agg a
  JOIN public.profiles p ON p.id = a.user_id
  ORDER BY a.pts DESC
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.monthly_leaderboard() TO anon, authenticated;

-- Seed default missions
INSERT INTO public.missions(key, name, description, icon, rule_key, target, reward_points, sort_order) VALUES
  ('first_order',    'İlk Satın Alma',        'İlk siparişini onayla',                     '🛒', 'first_order',   1,    50, 10),
  ('first_review',   'İlk Yorum',             'Bir ürüne yorum yaz',                       '✍️', 'first_review',  1,    50, 20),
  ('three_reviews',  'Yorum Ustası',          '3 ürüne yorum yaz',                         '⭐', 'three_reviews', 3,   150, 30),
  ('five_favorites', 'Koleksiyoncu',          '5 ürünü favorilere ekle',                   '❤️', 'five_favorites',5,    30, 40),
  ('streak_3',       '3 Gün Seri',            '3 gün üst üste giriş yap',                  '🔥', 'streak_3',      3,    30, 50),
  ('streak_7',       'Haftalık Rutin',        '7 gün üst üste giriş yap',                  '⚡', 'streak_7',      7,   100, 60),
  ('refer_one',      'İlk Davet',             'Bir arkadaşını davet et',                   '🤝', 'refer_one',     1,   100, 70),
  ('spend_500',      '₺500 Harcama',          'Toplam ₺500 sipariş ver',                   '💎', 'spend_500',     500,  100, 80),
  ('spend_2000',     '₺2.000 Harcama',        'Toplam ₺2.000 sipariş ver',                 '👑', 'spend_2000',    2000, 500, 90)
ON CONFLICT (key) DO NOTHING;
