-- ============ TIERS ============
CREATE TABLE public.dealer_tiers (
  slug text PRIMARY KEY,
  name text NOT NULL,
  min_volume_try numeric(12,2) NOT NULL DEFAULT 0,
  commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dealer_tiers TO anon, authenticated;
GRANT ALL ON public.dealer_tiers TO service_role;
ALTER TABLE public.dealer_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dealer_tiers_read" ON public.dealer_tiers FOR SELECT USING (true);
CREATE POLICY "dealer_tiers_admin" ON public.dealer_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.dealer_tiers (slug,name,min_volume_try,commission_percent,discount_percent,sort_order) VALUES
  ('bronze','Bronz Bayi',0,8,3,1),
  ('silver','Gümüş Bayi',10000,12,5,2),
  ('gold','Altın Bayi',50000,15,8,3),
  ('platinum','Platin Bayi',150000,20,12,4);

-- ============ APPLICATIONS ============
CREATE TABLE public.dealer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_name text NOT NULL,
  contact_phone text,
  channel text,
  monthly_volume_try numeric(12,2),
  note text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dealer_app_one_pending ON public.dealer_applications(user_id) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE ON public.dealer_applications TO authenticated;
GRANT ALL ON public.dealer_applications TO service_role;
ALTER TABLE public.dealer_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dealer_app_own_read" ON public.dealer_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "dealer_app_admin_write" ON public.dealer_applications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ DEALERS ============
CREATE TABLE public.dealers (
  user_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  company_name text,
  tier_slug text NOT NULL DEFAULT 'bronze' REFERENCES public.dealer_tiers(slug),
  commission_percent numeric(5,2),
  discount_percent numeric(5,2),
  total_volume_try numeric(12,2) NOT NULL DEFAULT 0,
  total_commission_try numeric(12,2) NOT NULL DEFAULT 0,
  paid_commission_try numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dealers TO authenticated;
GRANT ALL ON public.dealers TO service_role;
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dealers_own_read" ON public.dealers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "dealers_admin_all" ON public.dealers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ COMMISSIONS ============
CREATE TABLE public.dealer_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_user_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  order_id uuid NOT NULL,
  base_amount_try numeric(12,2) NOT NULL,
  rate_percent numeric(5,2) NOT NULL,
  amount_try numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dealer_comm_order_uniq ON public.dealer_commissions(order_id);
CREATE INDEX dealer_comm_dealer_idx ON public.dealer_commissions(dealer_user_id, created_at DESC);
GRANT SELECT ON public.dealer_commissions TO authenticated;
GRANT ALL ON public.dealer_commissions TO service_role;
ALTER TABLE public.dealer_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dealer_comm_own_read" ON public.dealer_commissions FOR SELECT TO authenticated
  USING (dealer_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "dealer_comm_admin_all" ON public.dealer_commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ PROFILE LINK ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dealer_id uuid;
CREATE INDEX IF NOT EXISTS profiles_dealer_idx ON public.profiles(dealer_id);

-- ============ APPLY ============
CREATE OR REPLACE FUNCTION public.apply_for_dealership(
  _company_name text, _contact_phone text, _channel text,
  _monthly_volume numeric, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF EXISTS (SELECT 1 FROM public.dealers WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Zaten bayisiniz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dealer_applications WHERE user_id = v_uid AND status = 'pending') THEN
    RAISE EXCEPTION 'Bekleyen bir başvurunuz var';
  END IF;
  IF btrim(COALESCE(_company_name,'')) = '' THEN RAISE EXCEPTION 'Firma/rumuz adı gerekli'; END IF;
  INSERT INTO public.dealer_applications(user_id, company_name, contact_phone, channel, monthly_volume_try, note)
  VALUES (v_uid, left(btrim(_company_name),120), left(COALESCE(_contact_phone,''),40),
          left(COALESCE(_channel,''),60), GREATEST(0, COALESCE(_monthly_volume,0)), left(COALESCE(_note,''),1000))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ============ ADMIN REVIEW ============
CREATE OR REPLACE FUNCTION public.admin_review_dealer_application(
  _application_id uuid, _approve boolean, _admin_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_app public.dealer_applications%ROWTYPE; v_code text; v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_i int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT * INTO v_app FROM public.dealer_applications WHERE id = _application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Başvuru bulunamadı'; END IF;
  IF v_app.status <> 'pending' THEN RAISE EXCEPTION 'Başvuru zaten sonuçlanmış'; END IF;

  UPDATE public.dealer_applications
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        admin_note = _admin_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = _application_id;

  IF _approve THEN
    LOOP
      v_code := 'BAYI';
      FOR v_i IN 1..5 LOOP
        v_code := v_code || substr(v_chars, 1 + floor(random()*length(v_chars))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.dealers WHERE code = v_code);
    END LOOP;
    INSERT INTO public.dealers(user_id, code, company_name, approved_by, approved_at)
    VALUES (v_app.user_id, v_code, v_app.company_name, auth.uid(), now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_app.user_id, 'dealer',
    CASE WHEN _approve THEN 'Bayilik başvurun onaylandı' ELSE 'Bayilik başvurun reddedildi' END,
    COALESCE(_admin_note, CASE WHEN _approve THEN 'Bayi panelin aktif, hemen incele.' ELSE 'Daha sonra tekrar başvurabilirsin.' END),
    '/bayilik');
END; $$;

-- ============ ATTACH DEALER CODE ============
CREATE OR REPLACE FUNCTION public.attach_dealer_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_dealer uuid; v_existing uuid; v_orders int;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT user_id INTO v_dealer FROM public.dealers WHERE upper(code) = upper(btrim(_code)) AND active = true;
  IF v_dealer IS NULL OR v_dealer = v_uid THEN RETURN false; END IF;
  SELECT dealer_id INTO v_existing FROM public.profiles WHERE id = v_uid;
  IF v_existing IS NOT NULL THEN RETURN false; END IF;
  SELECT COUNT(*) INTO v_orders FROM public.orders WHERE user_id = v_uid AND status = 'approved';
  IF v_orders > 0 THEN RETURN false; END IF;
  UPDATE public.profiles SET dealer_id = v_dealer, updated_at = now() WHERE id = v_uid;
  RETURN true;
END; $$;

-- ============ COMMISSION TRIGGER ============
CREATE OR REPLACE FUNCTION public.grant_dealer_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_dealer uuid; v_rate numeric(5,2); v_base numeric(12,2);
  v_discount numeric(12,2) := 0; v_amount numeric(12,2); v_volume numeric(12,2);
  v_new_tier text; v_tier record;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT dealer_id INTO v_dealer FROM public.profiles WHERE id = NEW.user_id;

  -- bayinin kendi alımı da ciroya sayılır
  IF EXISTS (SELECT 1 FROM public.dealers WHERE user_id = NEW.user_id) THEN
    SELECT COALESCE(SUM(discount_try),0) INTO v_discount FROM public.order_discounts WHERE order_id = NEW.id;
    UPDATE public.dealers
      SET total_volume_try = total_volume_try + GREATEST(0, NEW.price_try - v_discount), updated_at = now()
      WHERE user_id = NEW.user_id
      RETURNING total_volume_try INTO v_volume;
    SELECT * INTO v_tier FROM public.dealer_tiers WHERE min_volume_try <= v_volume ORDER BY min_volume_try DESC LIMIT 1;
    IF v_tier.slug IS NOT NULL THEN
      UPDATE public.dealers SET tier_slug = v_tier.slug WHERE user_id = NEW.user_id AND tier_slug <> v_tier.slug;
    END IF;
  END IF;

  IF v_dealer IS NULL OR v_dealer = NEW.user_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dealers WHERE user_id = v_dealer AND active = true) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.dealer_commissions WHERE order_id = NEW.id) THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_discount FROM public.order_discounts WHERE order_id = NEW.id;
  v_base := GREATEST(0, NEW.price_try - v_discount);
  IF v_base <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(d.commission_percent, t.commission_percent) INTO v_rate
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = v_dealer;

  v_amount := round(v_base * COALESCE(v_rate,0) / 100.0, 2);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.dealer_commissions(dealer_user_id, buyer_user_id, order_id, base_amount_try, rate_percent, amount_try)
  VALUES (v_dealer, NEW.user_id, NEW.id, v_base, v_rate, v_amount);

  UPDATE public.dealers
    SET total_commission_try = total_commission_try + v_amount,
        total_volume_try = total_volume_try + v_base,
        updated_at = now()
    WHERE user_id = v_dealer
    RETURNING total_volume_try INTO v_volume;

  SELECT * INTO v_tier FROM public.dealer_tiers WHERE min_volume_try <= v_volume ORDER BY min_volume_try DESC LIMIT 1;
  IF v_tier.slug IS NOT NULL THEN
    UPDATE public.dealers SET tier_slug = v_tier.slug WHERE user_id = v_dealer AND tier_slug <> v_tier.slug;
  END IF;

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_dealer, 'dealer', 'Yeni bayi komisyonu',
          '₺' || v_amount::text || ' komisyon kazandın', '/bayilik');

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_dealer_commission ON public.orders;
CREATE TRIGGER trg_dealer_commission
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.grant_dealer_commission();

-- ============ DEALER STATS ============
CREATE OR REPLACE FUNCTION public.dealer_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_d record; v_next record; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum yok'; END IF;
  SELECT d.*, t.name AS tier_name, t.commission_percent AS tier_commission, t.discount_percent AS tier_discount
    INTO v_d
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = v_uid;
  IF v_d.user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_next FROM public.dealer_tiers
   WHERE min_volume_try > v_d.total_volume_try ORDER BY min_volume_try ASC LIMIT 1;

  SELECT jsonb_build_object(
    'code', v_d.code,
    'company_name', v_d.company_name,
    'active', v_d.active,
    'tier_slug', v_d.tier_slug,
    'tier_name', v_d.tier_name,
    'commission_percent', COALESCE(v_d.commission_percent, v_d.tier_commission),
    'discount_percent', COALESCE(v_d.discount_percent, v_d.tier_discount),
    'total_volume_try', v_d.total_volume_try,
    'total_commission_try', v_d.total_commission_try,
    'paid_commission_try', v_d.paid_commission_try,
    'pending_commission_try', (SELECT COALESCE(SUM(amount_try),0) FROM public.dealer_commissions
                               WHERE dealer_user_id = v_uid AND status = 'pending'),
    'customer_count', (SELECT COUNT(*) FROM public.profiles WHERE dealer_id = v_uid),
    'order_count', (SELECT COUNT(*) FROM public.dealer_commissions WHERE dealer_user_id = v_uid),
    'next_tier', CASE WHEN v_next.slug IS NULL THEN NULL ELSE jsonb_build_object(
        'name', v_next.name, 'min_volume_try', v_next.min_volume_try,
        'commission_percent', v_next.commission_percent, 'discount_percent', v_next.discount_percent) END,
    'monthly', (SELECT COALESCE(jsonb_agg(x ORDER BY x->>'month'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'month', to_char(date_trunc('month', created_at),'YYYY-MM'),
          'volume', SUM(base_amount_try),
          'commission', SUM(amount_try),
          'orders', COUNT(*)) AS x
        FROM public.dealer_commissions
        WHERE dealer_user_id = v_uid AND created_at > now() - interval '6 months'
        GROUP BY 1) s)
  ) INTO v_res;
  RETURN v_res;
END; $$;

-- ============ DEALER CUSTOMERS ============
CREATE OR REPLACE FUNCTION public.dealer_customers()
RETURNS TABLE(user_id uuid, display_name text, email_masked text, joined_at timestamptz,
              order_count bigint, total_spent numeric, commission_earned numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id,
         COALESCE(p.display_name,'Kullanıcı'),
         CASE WHEN p.email IS NULL THEN NULL
              ELSE left(p.email,2) || '***' || substring(p.email from position('@' in p.email)) END,
         p.created_at,
         (SELECT COUNT(*) FROM public.dealer_commissions c WHERE c.buyer_user_id = p.id AND c.dealer_user_id = auth.uid()),
         (SELECT COALESCE(SUM(c.base_amount_try),0) FROM public.dealer_commissions c WHERE c.buyer_user_id = p.id AND c.dealer_user_id = auth.uid()),
         (SELECT COALESCE(SUM(c.amount_try),0) FROM public.dealer_commissions c WHERE c.buyer_user_id = p.id AND c.dealer_user_id = auth.uid())
  FROM public.profiles p
  WHERE p.dealer_id = auth.uid()
  ORDER BY p.created_at DESC
  LIMIT 200;
$$;

-- ============ DEALER PRICE LIST ============
CREATE OR REPLACE FUNCTION public.dealer_price_list()
RETURNS TABLE(id uuid, name text, slug text, category text, image_url text,
              price_try numeric, dealer_price_try numeric, available int, unlimited_stock boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_disc numeric(5,2);
BEGIN
  SELECT COALESCE(d.discount_percent, t.discount_percent) INTO v_disc
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = auth.uid() AND d.active = true;
  IF v_disc IS NULL THEN RAISE EXCEPTION 'Bayi değilsiniz'; END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.slug, p.category, p.image_url, p.price_try,
         round(p.price_try * (100 - v_disc) / 100.0, 2),
         COALESCE((SELECT COUNT(*)::int FROM public.license_keys k
                   WHERE k.product_id = p.id AND k.status = 'available'), 0),
         p.unlimited_stock
  FROM public.products p
  WHERE p.active = true
  ORDER BY p.sort_order, p.name;
END; $$;

-- ============ DEALER BULK ORDER ============
CREATE OR REPLACE FUNCTION public.dealer_create_order(_product_id uuid, _quantity int)
RETURNS TABLE(order_id uuid, reference_code text, total_try numeric, discount_try numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_disc numeric(5,2); v_p public.products%ROWTYPE;
  v_avail int; v_subtotal numeric(12,2); v_discount numeric(12,2);
  v_ref text := 'SBR-'; v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_i int; v_oid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum yok'; END IF;
  IF _quantity < 1 OR _quantity > 50 THEN RAISE EXCEPTION 'Adet 1-50 arası olmalı'; END IF;

  SELECT COALESCE(d.discount_percent, t.discount_percent) INTO v_disc
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = v_uid AND d.active = true;
  IF v_disc IS NULL THEN RAISE EXCEPTION 'Bayi değilsiniz'; END IF;

  SELECT * INTO v_p FROM public.products WHERE id = _product_id AND active = true;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Ürün bulunamadı'; END IF;
  IF NOT v_p.manual_fulfillment AND NOT v_p.unlimited_stock THEN
    SELECT COUNT(*) INTO v_avail FROM public.license_keys WHERE product_id = v_p.id AND status = 'available';
    IF v_avail < _quantity THEN RAISE EXCEPTION 'Stokta yeterli anahtar yok (% adet)', v_avail; END IF;
  END IF;

  FOR v_i IN 1..8 LOOP
    v_ref := v_ref || substr(v_chars, 1 + floor(random()*length(v_chars))::int, 1);
  END LOOP;

  v_subtotal := round(v_p.price_try * _quantity, 2);
  v_discount := round(v_subtotal * v_disc / 100.0, 2);

  INSERT INTO public.orders (user_id, product_id, price_try, reference_code, status, item_count, user_note)
  VALUES (v_uid, NULL, v_subtotal, v_ref, 'pending', _quantity, 'Bayi toplu alım')
  RETURNING id INTO v_oid;

  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
  VALUES (v_oid, v_p.id, _quantity, v_p.price_try, v_p.name);

  IF v_discount > 0 THEN
    INSERT INTO public.order_discounts (order_id, code_snapshot, discount_try, product_id)
    VALUES (v_oid, 'BAYI-' || v_disc::text, v_discount, v_p.id);
  END IF;

  RETURN QUERY SELECT v_oid, v_ref, GREATEST(0, v_subtotal - v_discount), v_discount;
END; $$;

-- ============ PAY COMMISSIONS ============
CREATE OR REPLACE FUNCTION public.admin_pay_dealer_commissions(_dealer_user_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_total numeric(12,2); v_bal numeric(12,2);
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT COALESCE(SUM(amount_try),0) INTO v_total FROM public.dealer_commissions
   WHERE dealer_user_id = _dealer_user_id AND status = 'pending';
  IF v_total <= 0 THEN RAISE EXCEPTION 'Ödenecek komisyon yok'; END IF;

  UPDATE public.dealer_commissions SET status = 'paid', paid_at = now()
   WHERE dealer_user_id = _dealer_user_id AND status = 'pending';

  INSERT INTO public.wallets(user_id, balance_try) VALUES (_dealer_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_total, updated_at = now()
   WHERE user_id = _dealer_user_id RETURNING balance_try INTO v_bal;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, note, created_by)
  VALUES (_dealer_user_id, 'admin_credit', v_total, v_bal, 'Bayi komisyon ödemesi', auth.uid());

  UPDATE public.dealers SET paid_commission_try = paid_commission_try + v_total, updated_at = now()
   WHERE user_id = _dealer_user_id;

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (_dealer_user_id, 'dealer', 'Komisyon ödemen yapıldı',
          '₺' || v_total::text || ' cüzdanına aktarıldı', '/cuzdan');

  RETURN v_total;
END; $$;

-- ============ ADMIN LIST ============
CREATE OR REPLACE FUNCTION public.admin_list_dealers()
RETURNS TABLE(user_id uuid, email text, display_name text, code text, company_name text,
              tier_slug text, commission_percent numeric, discount_percent numeric,
              total_volume_try numeric, total_commission_try numeric, paid_commission_try numeric,
              pending_commission_try numeric, customer_count bigint, active boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  SELECT d.user_id, p.email, p.display_name, d.code, d.company_name, d.tier_slug,
         COALESCE(d.commission_percent, t.commission_percent),
         COALESCE(d.discount_percent, t.discount_percent),
         d.total_volume_try, d.total_commission_try, d.paid_commission_try,
         (SELECT COALESCE(SUM(c.amount_try),0) FROM public.dealer_commissions c
           WHERE c.dealer_user_id = d.user_id AND c.status = 'pending'),
         (SELECT COUNT(*) FROM public.profiles pr WHERE pr.dealer_id = d.user_id),
         d.active, d.created_at
  FROM public.dealers d
  JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  LEFT JOIN public.profiles p ON p.id = d.user_id
  ORDER BY d.total_volume_try DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_dealer_applications()
RETURNS TABLE(id uuid, user_id uuid, email text, display_name text, company_name text,
              contact_phone text, channel text, monthly_volume_try numeric, note text,
              status text, admin_note text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  SELECT a.id, a.user_id, p.email, p.display_name, a.company_name, a.contact_phone, a.channel,
         a.monthly_volume_try, a.note, a.status, a.admin_note, a.created_at
  FROM public.dealer_applications a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  ORDER BY (a.status = 'pending') DESC, a.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_dealer(
  _user_id uuid, _active boolean DEFAULT NULL, _tier_slug text DEFAULT NULL,
  _commission_percent numeric DEFAULT NULL, _discount_percent numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  UPDATE public.dealers SET
    active = COALESCE(_active, active),
    tier_slug = COALESCE(_tier_slug, tier_slug),
    commission_percent = CASE WHEN _commission_percent IS NULL THEN commission_percent
                              WHEN _commission_percent < 0 THEN NULL ELSE LEAST(_commission_percent, 40) END,
    discount_percent = CASE WHEN _discount_percent IS NULL THEN discount_percent
                            WHEN _discount_percent < 0 THEN NULL ELSE LEAST(_discount_percent, 30) END,
    updated_at = now()
  WHERE user_id = _user_id;
END; $$;