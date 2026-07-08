
-- =========================================
-- 1. FLASH İNDİRİMLER
-- =========================================
CREATE TABLE public.flash_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','amount')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_flash_sales_product_active ON public.flash_sales(product_id, is_active, ends_at);

GRANT SELECT ON public.flash_sales TO anon, authenticated;
GRANT ALL ON public.flash_sales TO service_role;
ALTER TABLE public.flash_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flash_sales public read active"
  ON public.flash_sales FOR SELECT
  USING (is_active = true AND now() BETWEEN starts_at AND ends_at);

CREATE POLICY "flash_sales admin all"
  ON public.flash_sales FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_flash_sales_updated_at
  BEFORE UPDATE ON public.flash_sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================
-- 2. REFERANS SİSTEMİ
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_bonus_paid BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

-- Kod üretme fonksiyonu
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_i INT;
  v_attempt INT := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := '';
    FOR v_i IN 1..7 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code) THEN
      RETURN v_code;
    END IF;
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'referral kod üretilemedi';
    END IF;
  END LOOP;
END; $$;

-- Mevcut kullanıcılara kod ata
UPDATE public.profiles SET referral_code = public.gen_referral_code() WHERE referral_code IS NULL;

-- handle_new_user'ı güncelle (davet kodu desteği)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref_code TEXT;
  v_referrer UUID;
BEGIN
  v_ref_code := NEW.raw_user_meta_data->>'ref';
  IF v_ref_code IS NOT NULL AND length(btrim(v_ref_code)) > 0 THEN
    SELECT id INTO v_referrer FROM public.profiles
      WHERE referral_code = upper(btrim(v_ref_code)) LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, referral_code, referred_by)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
      public.gen_referral_code(),
      v_referrer
    );
  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- wallet_txn_kind'a referral_bonus ekle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'wallet_txn_kind' AND e.enumlabel = 'referral_bonus') THEN
    ALTER TYPE public.wallet_txn_kind ADD VALUE 'referral_bonus';
  END IF;
END $$;

-- Referans bonus işleme fonksiyonu — sipariş onayında çağrılır
CREATE OR REPLACE FUNCTION public.process_referral_bonus(_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referrer UUID;
  v_paid BOOLEAN;
  v_bonus NUMERIC(12,2) := 25.00;
  v_bal_new NUMERIC(12,2);
  v_bal_ref NUMERIC(12,2);
BEGIN
  SELECT referred_by, referral_bonus_paid INTO v_referrer, v_paid
    FROM public.profiles WHERE id = _user_id;
  IF v_referrer IS NULL OR v_paid THEN RETURN; END IF;

  -- Yeni kullanıcıya
  INSERT INTO public.wallets(user_id, balance_try) VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_bonus, updated_at = now()
    WHERE user_id = _user_id RETURNING balance_try INTO v_bal_new;
  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (_user_id, 'referral_bonus', v_bonus, v_bal_new, 'Davet bonusu (davet edilen)');

  -- Davet edene
  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_referrer, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_bonus, updated_at = now()
    WHERE user_id = v_referrer RETURNING balance_try INTO v_bal_ref;
  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (v_referrer, 'referral_bonus', v_bonus, v_bal_ref, 'Davet bonusu (davet eden)');

  UPDATE public.profiles SET referral_bonus_paid = true WHERE id = _user_id;
END; $$;

-- =========================================
-- 3. BİLDİRİMLER
-- =========================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications own read"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "notifications own update"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Realtime aktif et
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Bildirim gönderme yardımcı fonksiyonu
CREATE OR REPLACE FUNCTION public.push_notification(
  _user_id UUID, _type TEXT, _title TEXT, _body TEXT DEFAULT NULL, _link TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (_user_id, _type, _title, _body, _link) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- =========================================
-- 4. BLOG
-- =========================================
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blog_posts_published ON public.blog_posts(published_at DESC) WHERE published_at IS NOT NULL;

GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog public read published"
  ON public.blog_posts FOR SELECT
  USING (published_at IS NOT NULL AND published_at <= now());

CREATE POLICY "blog admin all"
  ON public.blog_posts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
