CREATE OR REPLACE FUNCTION public.approve_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
  FROM public.license_keys lk
  WHERE lk.product_id = v_product_id AND lk.status = 'available'
  ORDER BY lk.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Havuzda müsait key yok: "%". Önce Key Havuzu''ndan bu ürüne key ekleyin, sonra onaylayın.', v_product_name;
  END IF;

  IF v_delivery = 'link_token' THEN
    v_token := encode(gen_random_bytes(18), 'base64');
    v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
    UPDATE public.license_keys lk
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
          activation_token = COALESCE(lk.activation_token, v_token)
      WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
  ELSE
    UPDATE public.license_keys lk
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
      WHERE lk.id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id) VALUES (_order_id, v_key_id);
  UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;

  license_key := v_key_value;
  activation_token := v_token;
  RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public._assign_key_to_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order_product uuid;
  v_has_items boolean;
  v_item RECORD;
  v_product_id uuid; v_delivery public.delivery_type; v_slug text;
  v_key_id uuid; v_key_value text; v_token text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_seg text; v_new_key text; v_attempt int; v_i int; v_j int;
  v_is_lovable boolean;
  v_first_key text := NULL;
  v_first_token text := NULL;
  v_qi int;
BEGIN
  SELECT o.product_id INTO v_order_product FROM public.orders o WHERE o.id = _order_id;
  SELECT EXISTS(SELECT 1 FROM public.order_items WHERE order_id = _order_id) INTO v_has_items;

  IF NOT v_has_items AND v_order_product IS NULL THEN
    RAISE EXCEPTION 'Sipariş için ürün bulunamadı';
  END IF;

  IF NOT v_has_items THEN
    FOR v_qi IN 1..1 LOOP
      SELECT p.id, p.delivery_type, p.slug INTO v_product_id, v_delivery, v_slug
        FROM public.products p WHERE p.id = v_order_product;

      v_is_lovable := (v_product_id = '4f6d86cf-6a89-4940-90af-953cc3d6ab5f'::uuid)
                   OR (v_slug ILIKE 'lovable%');

      SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
      FROM public.license_keys lk
      WHERE lk.product_id = v_product_id AND lk.status = 'available'
      ORDER BY lk.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

      IF v_key_id IS NULL AND v_delivery = 'key' AND v_is_lovable THEN
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

      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Bu ürün için stokta anahtar yok. Lütfen admin panelinden anahtar ekleyin.';
      END IF;

      IF v_delivery = 'link_token' THEN
        v_token := encode(public.gen_random_bytes(18), 'base64');
        v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
        UPDATE public.license_keys lk
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
              activation_token = COALESCE(lk.activation_token, v_token)
          WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
      ELSE
        UPDATE public.license_keys lk
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
          WHERE lk.id = v_key_id;
        v_token := NULL;
      END IF;

      INSERT INTO public.order_keys (order_id, license_key_id)
        VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

      v_first_key := v_key_value;
      v_first_token := v_token;
    END LOOP;

    license_key := v_first_key;
    activation_token := v_first_token;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT oi.product_id, oi.quantity, p.delivery_type, p.slug
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
    ORDER BY oi.created_at
  LOOP
    v_product_id := v_item.product_id;
    v_delivery := v_item.delivery_type;
    v_slug := v_item.slug;
    v_is_lovable := (v_product_id = '4f6d86cf-6a89-4940-90af-953cc3d6ab5f'::uuid)
                 OR (v_slug ILIKE 'lovable%');

    FOR v_qi IN 1..v_item.quantity LOOP
      SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
      FROM public.license_keys lk
      WHERE lk.product_id = v_product_id AND lk.status = 'available'
      ORDER BY lk.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

      IF v_key_id IS NULL AND v_delivery = 'key' AND v_is_lovable THEN
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

      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Stokta anahtar tükendi (ürün id: %)', v_product_id;
      END IF;

      IF v_delivery = 'link_token' THEN
        v_token := encode(public.gen_random_bytes(18), 'base64');
        v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
        UPDATE public.license_keys lk
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
              activation_token = COALESCE(lk.activation_token, v_token)
          WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
      ELSE
        UPDATE public.license_keys lk
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
          WHERE lk.id = v_key_id;
        v_token := NULL;
      END IF;

      INSERT INTO public.order_keys (order_id, license_key_id)
        VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

      IF v_first_key IS NULL THEN
        v_first_key := v_key_value;
        v_first_token := v_token;
      END IF;
    END LOOP;
  END LOOP;

  license_key := v_first_key;
  activation_token := v_first_token;
  RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public.finalize_free_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
    FROM public.license_keys lk
    WHERE lk.product_id = v_product_id AND lk.status = 'available'
    ORDER BY lk.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Havuzda müsait key yok: "%". Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.', v_product_name;
  END IF;

  IF v_delivery = 'link_token' THEN
    v_token := encode(gen_random_bytes(18), 'base64');
    v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
    UPDATE public.license_keys lk
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
          activation_token = COALESCE(lk.activation_token, v_token)
      WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
  ELSE
    UPDATE public.license_keys lk
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
      WHERE lk.id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id) VALUES (_order_id, v_key_id);
  UPDATE public.orders SET status = 'approved', approved_at = now(), price_try = 0 WHERE id = _order_id;

  license_key := v_key_value;
  activation_token := v_token;
  RETURN NEXT;
END; $function$;