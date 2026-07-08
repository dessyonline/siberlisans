
CREATE OR REPLACE FUNCTION public.approve_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id UUID;
  v_product_name TEXT;
  v_status public.order_status;
  v_delivery public.delivery_type;
  v_key_id UUID;
  v_key_value TEXT;
  v_token TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  SELECT o.product_id, o.status, p.delivery_type, p.name
    INTO v_product_id, v_status, v_delivery, v_product_name
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.id = _order_id FOR UPDATE;

  IF v_product_id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'Sipariş zaten onaylı'; END IF;

  SELECT id, key_value INTO v_key_id, v_key_value
  FROM public.license_keys
  WHERE product_id = v_product_id AND status = 'available'
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Havuzda müsait key yok: "%". Önce Key Havuzu''ndan bu ürüne key ekleyin, sonra onaylayın.', v_product_name;
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
  UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;

  RETURN QUERY SELECT v_key_value, v_token;
END; $function$;


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
  v_product_name TEXT;
  v_delivery public.delivery_type;
  v_key_id UUID;
  v_key_value TEXT;
  v_token TEXT;
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

  SELECT p.id, p.delivery_type, p.name INTO v_product_id, v_delivery, v_product_name
    FROM public.products p WHERE p.id = v_order.product_id;

  SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.license_keys
    WHERE product_id = v_product_id AND status = 'available'
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Havuzda müsait key yok: "%". Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.', v_product_name;
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
