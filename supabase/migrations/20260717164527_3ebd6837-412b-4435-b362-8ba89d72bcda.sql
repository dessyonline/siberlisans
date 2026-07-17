
CREATE OR REPLACE FUNCTION public.approve_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id UUID;
  v_status public.order_status;
  v_delivery public.delivery_type;
  v_duration public.duration_type;
  v_default_days INT;
  v_unlimited BOOLEAN;
  v_days INT;
  v_expires TIMESTAMPTZ;
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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  SELECT o.product_id, o.status, p.delivery_type, p.duration, p.default_license_days, p.unlimited_stock
    INTO v_product_id, v_status, v_delivery, v_duration, v_default_days, v_unlimited
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.id = _order_id FOR UPDATE;

  IF v_product_id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'Sipariş zaten onaylı'; END IF;

  v_days := COALESCE(v_default_days, CASE v_duration
    WHEN 'hourly' THEN NULL
    WHEN 'daily' THEN 1
    WHEN 'weekly' THEN 7
    WHEN 'monthly' THEN 30
    WHEN 'yearly' THEN 365
    WHEN 'lifetime' THEN NULL
    ELSE NULL
  END);
  IF v_days IS NOT NULL THEN
    v_expires := now() + make_interval(days => v_days);
  END IF;

  -- Sınırsız stok: havuzdaki EN ESKİ mevcut anahtarı (available veya assigned) paylaşımlı olarak yeniden ver
  IF v_unlimited THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.license_keys
    WHERE product_id = v_product_id
    ORDER BY created_at ASC LIMIT 1;
    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Sınırsız stok ürünü için havuzda paylaşımlı bir anahtar/link yok';
    END IF;
    INSERT INTO public.order_keys (order_id, license_key_id) VALUES (_order_id, v_key_id);
    UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;
    RETURN QUERY SELECT v_key_value, NULL::text;
    RETURN;
  END IF;

  -- Standart havuz akışı
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
        INSERT INTO public.license_keys (product_id, key_value, status, duration_days, expires_at)
        VALUES (v_product_id, v_new_key, 'available', v_days, v_expires)
        RETURNING id, key_value INTO v_key_id, v_key_value;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt > 12 THEN RAISE EXCEPTION 'Key üretilemedi'; END IF;
      END;
    END LOOP;
  END IF;

  IF v_delivery = 'link_token' THEN
    -- Havuzdaki key_value gerçek bir http(s) linkiyse token üretme, direkt linki teslim et
    IF v_key_value ~* '^https?://' THEN
      UPDATE public.license_keys
        SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
            duration_days = COALESCE(duration_days, v_days),
            expires_at = COALESCE(expires_at, v_expires)
        WHERE id = v_key_id;
      v_token := NULL;
    ELSE
      v_token := encode(gen_random_bytes(18), 'base64');
      v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
      UPDATE public.license_keys
        SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
            activation_token = COALESCE(activation_token, v_token),
            duration_days = COALESCE(duration_days, v_days),
            expires_at = COALESCE(expires_at, v_expires)
        WHERE id = v_key_id RETURNING activation_token INTO v_token;
    END IF;
  ELSE
    UPDATE public.license_keys
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
          duration_days = COALESCE(duration_days, v_days),
          expires_at = COALESCE(expires_at, v_expires)
      WHERE id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id) VALUES (_order_id, v_key_id);
  UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;

  RETURN QUERY SELECT v_key_value, v_token;
END; $function$;
