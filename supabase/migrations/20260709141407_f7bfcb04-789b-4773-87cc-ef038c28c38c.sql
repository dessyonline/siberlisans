CREATE OR REPLACE FUNCTION public.prevent_order_sensitive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean := (auth.uid() IS NOT NULL AND auth.uid() = OLD.user_id);
  v_is_admin boolean := (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'));
  v_trusted boolean := (current_setting('app.trusted_op', true) = '1');
BEGIN
  IF auth.uid() IS NULL OR v_is_admin OR v_trusted THEN
    RETURN NEW;
  END IF;

  IF v_is_owner THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'pending' AND NEW.status IN ('reviewing','rejected')) THEN
        RAISE EXCEPTION 'Bu aşamada durumu değiştiremezsiniz';
      END IF;
    END IF;
    IF (NEW.price_try IS DISTINCT FROM OLD.price_try
        OR NEW.item_count IS DISTINCT FROM OLD.item_count)
       AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Onaylanmış siparişin tutarı değiştirilemez';
    END IF;
    IF NEW.admin_note IS DISTINCT FROM OLD.admin_note
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.external_status IS DISTINCT FROM OLD.external_status
       OR NEW.referral_commission_paid IS DISTINCT FROM OLD.referral_commission_paid
       OR NEW.shopier_order_id IS DISTINCT FROM OLD.shopier_order_id
       OR NEW.paid_with IS DISTINCT FROM OLD.paid_with
       OR NEW.abandonment_notified_at IS DISTINCT FROM OLD.abandonment_notified_at
       OR NEW.reference_code IS DISTINCT FROM OLD.reference_code
    THEN
      RAISE EXCEPTION 'Bu alanları değiştirme yetkiniz yok';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Yetkisiz';
END;
$$;

-- pay_order_with_wallet: aynı imza (drop-then-create), güvenli bağlam bayrağını set eder
DROP FUNCTION IF EXISTS public.pay_order_with_wallet(uuid);
CREATE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS TABLE(license_key text, license_token text, balance_after numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID; v_status public.order_status;
  v_price NUMERIC(12,2); v_discount NUMERIC(12,2) := 0;
  v_final NUMERIC(12,2); v_balance NUMERIC(12,2);
  v_key TEXT; v_token TEXT;
BEGIN
  PERFORM set_config('app.trusted_op', '1', true);
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid) TO authenticated;