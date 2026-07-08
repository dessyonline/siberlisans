
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_with TEXT NOT NULL DEFAULT 'bank'
    CHECK (paid_with IN ('bank','wallet'));

DO $$ BEGIN
  CREATE TYPE public.topup_status AS ENUM ('pending','reviewing','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_txn_kind AS ENUM
    ('topup','purchase','refund','admin_credit','admin_debit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_try NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance_try >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own wallet" ON public.wallets;
CREATE POLICY "Users read own wallet" ON public.wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.wallet_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_try NUMERIC(12,2) NOT NULL CHECK (amount_try > 0),
  reference_code TEXT NOT NULL UNIQUE,
  status public.topup_status NOT NULL DEFAULT 'pending',
  receipt_path TEXT,
  admin_note TEXT,
  user_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wallet_topups_user_idx ON public.wallet_topups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_topups_status_idx ON public.wallet_topups(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own topups" ON public.wallet_topups;
CREATE POLICY "Users read own topups" ON public.wallet_topups
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Users insert own topups" ON public.wallet_topups;
CREATE POLICY "Users insert own topups" ON public.wallet_topups
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own pending topups" ON public.wallet_topups;
CREATE POLICY "Users update own pending topups" ON public.wallet_topups
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('pending','reviewing'))
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins update all topups" ON public.wallet_topups;
CREATE POLICY "Admins update all topups" ON public.wallet_topups
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.wallet_txn_kind NOT NULL,
  amount_try NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  topup_id UUID REFERENCES public.wallet_topups(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_txn_user_idx ON public.wallet_transactions(user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own txns" ON public.wallet_transactions;
CREATE POLICY "Users read own txns" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public._assign_key_to_order(_order_id UUID)
RETURNS TABLE(license_key TEXT, activation_token TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_product_id UUID; v_delivery public.delivery_type;
  v_key_id UUID; v_key_value TEXT; v_token TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_seg TEXT; v_new_key TEXT; v_attempt INT; v_i INT; v_j INT;
BEGIN
  SELECT o.product_id, p.delivery_type INTO v_product_id, v_delivery
  FROM public.orders o JOIN public.products p ON p.id = o.product_id
  WHERE o.id = _order_id;
  IF v_product_id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;

  SELECT id, key_value INTO v_key_id, v_key_value
  FROM public.license_keys
  WHERE product_id = v_product_id AND status = 'available'
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN
    v_attempt := 0;
    LOOP
      v_attempt := v_attempt + 1;
      v_new_key := 'SIBER';
      FOR v_i IN 1..3 LOOP
        v_seg := '';
        FOR v_j IN 1..4 LOOP
          v_seg := v_seg || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
        END LOOP;
        v_new_key := v_new_key || '-' || v_seg;
      END LOOP;
      BEGIN
        INSERT INTO public.license_keys (product_id, key_value, status)
        VALUES (v_product_id, v_new_key, 'available')
        RETURNING id, key_value INTO v_key_id, v_key_value;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt > 12 THEN RAISE EXCEPTION 'Key üretilemedi'; END IF;
      END;
    END LOOP;
  END IF;

  IF v_delivery = 'link_token' THEN
    v_token := encode(public.gen_random_bytes(18), 'base64');
    v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
    UPDATE public.license_keys
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
          activation_token = COALESCE(activation_token, v_token)
      WHERE id = v_key_id RETURNING activation_token INTO v_token;
  ELSE
    UPDATE public.license_keys
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
      WHERE id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id)
  VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_key_value, v_token;
END; $function$;
REVOKE ALL ON FUNCTION public._assign_key_to_order(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id UUID)
RETURNS TABLE(license_key TEXT, activation_token TEXT, balance_after NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID; v_status public.order_status;
  v_price NUMERIC(12,2); v_discount NUMERIC(12,2) := 0;
  v_final NUMERIC(12,2); v_balance NUMERIC(12,2);
  v_key TEXT; v_token TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Oturum yok'; END IF;
  SELECT user_id, status, price_try INTO v_owner, v_status, v_price
  FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_owner <> v_user THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_status <> 'pending' AND v_status <> 'reviewing' THEN
    RAISE EXCEPTION 'Bu sipariş için ödeme yapılamaz';
  END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_discount
  FROM public.order_discounts WHERE order_id = _order_id;
  v_final := GREATEST(0, v_price - v_discount);

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_user, 0)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_try INTO v_balance FROM public.wallets
    WHERE user_id = v_user FOR UPDATE;

  IF v_balance < v_final THEN
    RAISE EXCEPTION 'Yetersiz bakiye';
  END IF;

  UPDATE public.wallets
    SET balance_try = balance_try - v_final, updated_at = now()
    WHERE user_id = v_user RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
  VALUES (v_user, 'purchase', -v_final, v_balance, _order_id, 'Sipariş ödemesi', v_user);

  UPDATE public.orders
    SET status = 'approved', approved_at = now(), paid_with = 'wallet', updated_at = now()
    WHERE id = _order_id;

  SELECT * INTO v_key, v_token FROM public._assign_key_to_order(_order_id);
  RETURN QUERY SELECT v_key, v_token, v_balance;
END; $function$;
REVOKE ALL ON FUNCTION public.pay_order_with_wallet(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_topup(_topup_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_user UUID; v_amount NUMERIC(12,2); v_status public.topup_status; v_balance NUMERIC(12,2);
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT user_id, amount_try, status INTO v_user, v_amount, v_status
  FROM public.wallet_topups WHERE id = _topup_id FOR UPDATE;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Kayıt yok'; END IF;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'Zaten onaylı'; END IF;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_user, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_amount, updated_at = now()
    WHERE user_id = v_user RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, topup_id, note, created_by)
  VALUES (v_user, 'topup', v_amount, v_balance, _topup_id, 'Bakiye yükleme onaylandı', auth.uid());

  UPDATE public.wallet_topups SET status = 'approved', approved_at = now(), updated_at = now()
    WHERE id = _topup_id;
  RETURN v_balance;
END; $function$;
REVOKE ALL ON FUNCTION public.approve_topup(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_topup(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_topup(_topup_id UUID, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  UPDATE public.wallet_topups
    SET status = 'rejected', admin_note = _note, updated_at = now()
    WHERE id = _topup_id;
END; $function$;
REVOKE ALL ON FUNCTION public.reject_topup(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_topup(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(_user_id UUID, _delta NUMERIC, _note TEXT)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_balance NUMERIC(12,2);
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF _delta = 0 THEN RAISE EXCEPTION 'Delta 0 olamaz'; END IF;
  INSERT INTO public.wallets(user_id, balance_try) VALUES (_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets
    SET balance_try = GREATEST(0, balance_try + _delta), updated_at = now()
    WHERE user_id = _user_id RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, note, created_by)
  VALUES (_user_id,
          CASE WHEN _delta > 0 THEN 'admin_credit'::public.wallet_txn_kind
               ELSE 'admin_debit'::public.wallet_txn_kind END,
          _delta, v_balance, COALESCE(_note,'Admin düzeltmesi'), auth.uid());
  RETURN v_balance;
END; $function$;
REVOKE ALL ON FUNCTION public.admin_adjust_wallet(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(UUID, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_order_to_wallet(_order_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_owner UUID; v_price NUMERIC(12,2); v_discount NUMERIC(12,2) := 0;
  v_final NUMERIC(12,2); v_paid TEXT; v_balance NUMERIC(12,2); v_already INT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT user_id, price_try, paid_with INTO v_owner, v_price, v_paid
  FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_paid <> 'wallet' THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_already FROM public.wallet_transactions
    WHERE order_id = _order_id AND kind = 'refund';
  IF v_already > 0 THEN RAISE EXCEPTION 'Bu sipariş zaten iade edilmiş'; END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_discount
  FROM public.order_discounts WHERE order_id = _order_id;
  v_final := GREATEST(0, v_price - v_discount);

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_owner, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_final, updated_at = now()
    WHERE user_id = v_owner RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
  VALUES (v_owner, 'refund', v_final, v_balance, _owner, 'Sipariş iptali iadesi', auth.uid());

  RETURN v_balance;
END; $function$;
REVOKE ALL ON FUNCTION public.refund_order_to_wallet(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_order_to_wallet(UUID) TO authenticated;
