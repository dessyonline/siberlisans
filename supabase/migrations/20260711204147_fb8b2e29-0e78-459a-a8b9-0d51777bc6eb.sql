
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _subtotal numeric)
RETURNS TABLE(coupon_id uuid, code text, discount_try numeric, final_try numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.coupons%ROWTYPE;
  v_code text;
  v_disc numeric;
  v_used int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  v_code := upper(btrim(coalesce(_code,'')));
  IF v_code = '' THEN RAISE EXCEPTION 'Kod boş'; END IF;

  SELECT * INTO v_c FROM public.coupons WHERE upper(code) = v_code;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Kupon bulunamadı'; END IF;
  IF NOT v_c.is_active THEN RAISE EXCEPTION 'Kupon aktif değil'; END IF;
  IF v_c.expires_at IS NOT NULL AND v_c.expires_at < now() THEN
    RAISE EXCEPTION 'Kuponun süresi dolmuş';
  END IF;
  IF v_c.max_uses IS NOT NULL AND v_c.used_count >= v_c.max_uses THEN
    RAISE EXCEPTION 'Kupon kullanım limiti dolmuş';
  END IF;
  IF v_c.user_id IS NOT NULL AND v_c.user_id <> v_uid THEN
    RAISE EXCEPTION 'Bu kupon size ait değil';
  END IF;
  IF _subtotal < v_c.min_order_try THEN
    RAISE EXCEPTION 'Minimum sepet tutarı: ₺%', v_c.min_order_try;
  END IF;

  SELECT COUNT(*) INTO v_used FROM public.coupon_redemptions
    WHERE coupon_id = v_c.id AND user_id = v_uid;
  IF v_used > 0 THEN RAISE EXCEPTION 'Bu kuponu daha önce kullandınız'; END IF;

  IF v_c.discount_type = 'percent' THEN
    v_disc := round(_subtotal * v_c.discount_value / 100.0, 2);
  ELSE
    v_disc := v_c.discount_value;
  END IF;
  IF v_disc > _subtotal THEN v_disc := _subtotal; END IF;

  RETURN QUERY SELECT v_c.id, v_c.code, v_disc, (_subtotal - v_disc);
END; $$;
