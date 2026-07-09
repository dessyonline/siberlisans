
-- FAZ 3: AFFILIATE
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_try numeric(12,2) NOT NULL CHECK (amount_try > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','paid')),
  method text NOT NULL DEFAULT 'wallet' CHECK (method IN ('wallet','iban','crypto')),
  destination text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT, INSERT ON public.affiliate_payouts TO authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kendi payoutlarım" ON public.affiliate_payouts FOR SELECT USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "kendi payout talebim" ON public.affiliate_payouts FOR INSERT WITH CHECK (auth.uid()=user_id AND status='requested');
CREATE POLICY "admin payout yönet" ON public.affiliate_payouts FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.affiliate_stats(_user_id uuid)
RETURNS TABLE(total_earned numeric, total_paid numeric, pending numeric, referred_count int, active_referred_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT SUM(delta) FROM user_points_ledger WHERE user_id=_user_id AND reason LIKE 'referral%' AND delta>0),0)::numeric,
    COALESCE((SELECT SUM(amount_try) FROM affiliate_payouts WHERE user_id=_user_id AND status='paid'),0)::numeric,
    COALESCE((SELECT SUM(amount_try) FROM affiliate_payouts WHERE user_id=_user_id AND status IN ('requested','approved')),0)::numeric,
    (SELECT COUNT(*)::int FROM profiles WHERE referred_by=_user_id),
    (SELECT COUNT(DISTINCT o.user_id)::int FROM orders o JOIN profiles p ON p.id=o.user_id WHERE p.referred_by=_user_id AND o.status='approved');
$$;

CREATE OR REPLACE FUNCTION public.request_affiliate_payout(_amount numeric, _method text, _destination text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _avail numeric; _new numeric; _pid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth'; END IF;
  IF _amount < 50 THEN RAISE EXCEPTION 'min 50 TL'; END IF;
  SELECT balance_try INTO _avail FROM wallets WHERE user_id=_uid FOR UPDATE;
  IF _avail IS NULL OR _avail < _amount THEN RAISE EXCEPTION 'yetersiz bakiye'; END IF;
  _new := _avail - _amount;
  UPDATE wallets SET balance_try=_new WHERE user_id=_uid;
  INSERT INTO wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (_uid, 'debit', _amount, _new, 'Partner ödeme talebi (' || _method || ')');
  INSERT INTO affiliate_payouts(user_id, amount_try, method, destination)
    VALUES (_uid, _amount, _method, _destination) RETURNING id INTO _pid;
  RETURN _pid;
END; $$;

-- FAZ 5: BADGES + STREAK
CREATE TABLE IF NOT EXISTS public.badges (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text,
  rule_key text,
  threshold int,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.badges TO anon, authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rozetler herkese açık" ON public.badges FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
GRANT SELECT ON public.user_badges TO authenticated, anon;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rozet herkes okur" ON public.user_badges FOR SELECT USING (true);

INSERT INTO public.badges(id, name, description, icon, rule_key, threshold) VALUES
  ('first_order','İlk Adım','İlk siparişini verdin','🎯','orders_count',1),
  ('order_5','Sadık Müşteri','5 sipariş tamamlandı','⭐','orders_count',5),
  ('order_25','Efsane','25 sipariş tamamlandı','🏆','orders_count',25),
  ('spend_1000','₺1000 Kulübü','Toplam ₺1000 harcadın','💎','total_spend',1000),
  ('spend_5000','VIP','Toplam ₺5000 harcadın','👑','total_spend',5000),
  ('referrer_1','Davetçi','İlk davetin geldi','🤝','referral_count',1),
  ('referrer_5','Ağ Kurucusu','5 kişi davet ettin','🌐','referral_count',5),
  ('review_1','İlk Yorum','İlk yorumunu yazdın','📝','review_count',1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.recompute_badges(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _oc int; _spend numeric; _refc int; _revc int;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(price_try),0) INTO _oc, _spend FROM orders WHERE user_id=_user_id AND status='approved';
  SELECT COUNT(*) INTO _refc FROM profiles WHERE referred_by=_user_id;
  SELECT COUNT(*) INTO _revc FROM product_reviews WHERE user_id=_user_id;
  INSERT INTO user_badges(user_id, badge_id)
  SELECT _user_id, b.id FROM badges b
  WHERE (b.rule_key='orders_count' AND _oc >= b.threshold)
     OR (b.rule_key='total_spend' AND _spend >= b.threshold)
     OR (b.rule_key='referral_count' AND _refc >= b.threshold)
     OR (b.rule_key='review_count' AND _revc >= b.threshold)
  ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_badges_after_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM public.recompute_badges(NEW.user_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS badges_after_order ON public.orders;
CREATE TRIGGER badges_after_order AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_badges_after_order();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_streak int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_streak_at date;

CREATE OR REPLACE FUNCTION public.bump_login_streak()
RETURNS TABLE(streak int, bonus_points int) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _last date; _cur int; _bonus int := 0; _pts int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth'; END IF;
  SELECT last_streak_at, login_streak INTO _last, _cur FROM profiles WHERE id=_uid;
  IF _last = CURRENT_DATE THEN
    RETURN QUERY SELECT _cur, 0; RETURN;
  ELSIF _last = CURRENT_DATE - 1 THEN
    _cur := COALESCE(_cur,0) + 1;
  ELSE
    _cur := 1;
  END IF;
  _bonus := CASE WHEN _cur % 7 = 0 THEN 20 WHEN _cur % 3 = 0 THEN 5 ELSE 1 END;
  UPDATE profiles SET login_streak=_cur, last_streak_at=CURRENT_DATE, total_points=COALESCE(total_points,0)+_bonus WHERE id=_uid RETURNING total_points INTO _pts;
  INSERT INTO user_points_ledger(user_id, delta, balance_after, reason) VALUES (_uid, _bonus, _pts, 'streak_day_'||_cur);
  RETURN QUERY SELECT _cur, _bonus;
END; $$;

-- FAZ 8: BUNDLES
CREATE TABLE IF NOT EXISTS public.product_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_try numeric(12,2) NOT NULL,
  discount_percent int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.product_bundles TO anon, authenticated;
GRANT ALL ON public.product_bundles TO service_role;
ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aktif bundle" ON public.product_bundles FOR SELECT USING (active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin bundle" ON public.product_bundles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.product_bundle_items (
  bundle_id uuid NOT NULL REFERENCES public.product_bundles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  PRIMARY KEY (bundle_id, product_id)
);
GRANT SELECT ON public.product_bundle_items TO anon, authenticated;
GRANT ALL ON public.product_bundle_items TO service_role;
ALTER TABLE public.product_bundle_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bundle item oku" ON public.product_bundle_items FOR SELECT USING (true);
CREATE POLICY "admin bundle item" ON public.product_bundle_items FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- FAZ 4: LICENSE TRANSFER
CREATE TABLE IF NOT EXISTS public.license_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id),
  to_user_id uuid REFERENCES auth.users(id),
  to_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','canceled')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT ON public.license_transfers TO authenticated;
GRANT ALL ON public.license_transfers TO service_role;
ALTER TABLE public.license_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kendi transferlerim" ON public.license_transfers FOR SELECT USING (auth.uid()=from_user_id OR auth.uid()=to_user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "transfer başlat" ON public.license_transfers FOR INSERT WITH CHECK (auth.uid()=from_user_id);

CREATE OR REPLACE FUNCTION public.transfer_order(_order_id uuid, _to_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _to uuid; _tid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id=_order_id AND user_id=_uid AND status='approved') THEN
    RAISE EXCEPTION 'sipariş bulunamadı veya onaylı değil';
  END IF;
  SELECT id INTO _to FROM auth.users WHERE lower(email)=lower(_to_email);
  IF _to IS NULL THEN RAISE EXCEPTION 'alıcı kayıtlı değil'; END IF;
  IF _to = _uid THEN RAISE EXCEPTION 'kendine transfer edilemez'; END IF;
  PERFORM set_config('app.trusted_op','1',true);
  UPDATE orders SET user_id=_to WHERE id=_order_id;
  INSERT INTO license_transfers(order_id, from_user_id, to_user_id, to_email, status, completed_at)
    VALUES (_order_id, _uid, _to, _to_email, 'completed', now()) RETURNING id INTO _tid;
  INSERT INTO notifications(user_id, title, body, type)
    VALUES (_to, 'Sana bir lisans devredildi', 'Bir kullanıcı sana lisansını devretti. "Lisanslarım" bölümünden görebilirsin.', 'info');
  RETURN _tid;
END; $$;
