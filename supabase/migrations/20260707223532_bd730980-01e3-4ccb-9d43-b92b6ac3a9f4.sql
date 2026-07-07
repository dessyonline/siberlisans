CREATE OR REPLACE FUNCTION public.finalize_free_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_disc NUMERIC := 0;
  v_final NUMERIC;
  v_product_id UUID;
  v_delivery public.delivery_type;
  v_key_id UUID;
  v_key_value TEXT;
  v_token TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_seg TEXT;
  v_new_key TEXT;
  v_attempt INT;
  v_i INT;
  v_j INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_order.status = 'approved' THEN RAISE EXCEPTION 'Sipariş zaten onaylı'; END IF;
  IF v_order.status NOT IN ('pending','reviewing') THEN
    RAISE EXCEPTION 'Bu aşamada tamamlanamaz';
  END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_disc
    FROM public.order_discounts WHERE order_id = _order_id;
  v_final := v_order.price_try - v_disc;
  IF v_final > 0 THEN
    RAISE EXCEPTION 'Bu sipariş ücretsiz değil';
  END IF;

  SELECT p.id, p.delivery_type INTO v_product_id, v_delivery
    FROM public.products p WHERE p.id = v_order.product_id;

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
    v_token := encode(gen_random_bytes(18), 'base64');
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

  INSERT INTO public.order_keys (order_id, license_key_id) VALUES (_order_id, v_key_id);
  UPDATE public.orders SET status = 'approved', approved_at = now(), price_try = 0 WHERE id = _order_id;

  RETURN QUERY SELECT v_key_value, v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_free_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_free_order(uuid) TO authenticated;