
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
  v_manual BOOLEAN;
  v_unlimited BOOLEAN;
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

  SELECT o.product_id, o.status, p.delivery_type, p.manual_fulfillment, p.unlimited_stock
    INTO v_product_id, v_status, v_delivery, v_manual, v_unlimited
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.id = _order_id FOR UPDATE;

  IF v_product_id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'Sipariş zaten onaylı'; END IF;

  IF v_manual OR v_unlimited THEN
    UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;
    RETURN QUERY SELECT NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT id, key_value INTO v_key_id, v_key_value
  FROM public.license_keys
  WHERE product_id = v_product_id AND status = 'available'
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  -- Stok boşsa otomatik SIBER-XXXX-XXXX-XXXX üret (tüm delivery tipleri için)
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
      SET status = 'assigned',
          assigned_order_id = _order_id,
          assigned_at = now(),
          activation_token = COALESCE(activation_token, v_token)
      WHERE id = v_key_id
      RETURNING activation_token INTO v_token;
  ELSE
    UPDATE public.license_keys
      SET status = 'assigned',
          assigned_order_id = _order_id,
          assigned_at = now()
      WHERE id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id) VALUES (_order_id, v_key_id);
  UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;

  RETURN QUERY SELECT v_key_value, v_token;
END; $function$;
