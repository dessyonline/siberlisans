CREATE OR REPLACE FUNCTION public.apply_promo_code(_order_id uuid, _code text)
 RETURNS TABLE(discount_try numeric, final_price numeric, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_promo public.promo_codes%ROWTYPE;
  v_disc NUMERIC;
  v_final NUMERIC;
  v_code TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;

  v_code := upper(btrim(coalesce(_code,'')));
  IF v_code = '' THEN RAISE EXCEPTION 'Kod boş olamaz'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Bu sipariş sizin değil'; END IF;
  IF v_order.status NOT IN ('pending','reviewing') THEN
    RAISE EXCEPTION 'Bu aşamada kod uygulanamaz';
  END IF;

  SELECT * INTO v_promo FROM public.promo_codes pc WHERE upper(pc.code) = v_code FOR UPDATE;
  IF v_promo.id IS NULL THEN RAISE EXCEPTION 'Kod bulunamadı'; END IF;
  IF NOT v_promo.active THEN RAISE EXCEPTION 'Kod aktif değil'; END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RAISE EXCEPTION 'Kodun süresi dolmuş';
  END IF;
  IF v_promo.max_uses IS NOT NULL AND v_promo.used_count >= v_promo.max_uses THEN
    RAISE EXCEPTION 'Kodun kullanım limiti dolmuş';
  END IF;
  IF v_promo.product_id IS NOT NULL AND v_promo.product_id <> v_order.product_id THEN
    RAISE EXCEPTION 'Bu kod bu ürüne uygulanamaz';
  END IF;
  IF v_order.price_try < v_promo.min_amount THEN
    RAISE EXCEPTION 'Minimum tutar: ₺%', v_promo.min_amount;
  END IF;

  IF v_promo.discount_type = 'percent' THEN
    v_disc := round(v_order.price_try * v_promo.discount_value / 100.0, 2);
  ELSE
    v_disc := v_promo.discount_value;
  END IF;
  IF v_disc > v_order.price_try THEN v_disc := v_order.price_try; END IF;
  v_final := v_order.price_try - v_disc;

  IF EXISTS (SELECT 1 FROM public.order_discounts WHERE order_id = _order_id) THEN
    UPDATE public.promo_codes SET used_count = GREATEST(used_count - 1, 0)
      WHERE id = (SELECT promo_code_id FROM public.order_discounts WHERE order_id = _order_id);
    DELETE FROM public.order_discounts WHERE order_id = _order_id;
  END IF;

  INSERT INTO public.order_discounts (order_id, promo_code_id, code_snapshot, discount_try)
    VALUES (_order_id, v_promo.id, v_promo.code, v_disc);

  UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = v_promo.id;

  discount_try := v_disc;
  final_price := v_final;
  code := v_promo.code;
  RETURN NEXT;
END;
$function$;