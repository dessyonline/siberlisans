CREATE OR REPLACE FUNCTION public.approve_order(_order_id uuid)
RETURNS TABLE(license_key text, activation_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_product_id UUID;
  v_product_name TEXT;
  v_status public.order_status;
  v_delivery public.delivery_type;
  v_duration public.duration_type;
  v_default_days INT;
  v_unlimited BOOLEAN;
  v_manual BOOLEAN;
  v_days INT;
  v_expires TIMESTAMPTZ;
  v_key_id UUID;
  v_key_value TEXT;
  v_token TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  SELECT o.product_id, o.status, p.name, p.delivery_type, p.duration, p.default_license_days, p.unlimited_stock, COALESCE(p.manual_fulfillment,false)
    INTO v_product_id, v_status, v_product_name, v_delivery, v_duration, v_default_days, v_unlimited, v_manual
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

  -- Manuel teslimat: havuzdan anahtar atanmaz, sipariş doğrudan onaylanır
  IF v_manual THEN
    UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;
    RETURN QUERY SELECT NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_unlimited THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.license_keys
    WHERE product_id = v_product_id
    ORDER BY created_at ASC LIMIT 1;
    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Sınırsız stok ürünü için havuzda paylaşımlı bir anahtar/link yok';
    END IF;
    INSERT INTO public.order_keys (order_id, license_key_id)
      VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;
    UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;
    RETURN QUERY SELECT v_key_value, NULL::text;
    RETURN;
  END IF;

  SELECT id, key_value INTO v_key_id, v_key_value
  FROM public.license_keys
  WHERE product_id = v_product_id AND status = 'available'
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Havuzda "%" ürünü için kullanılabilir anahtar yok. Key havuzuna gerçek anahtarı ekleyin veya ürünü manuel teslimat olarak işaretleyin.', COALESCE(v_product_name, 'ürün');
  END IF;

  IF v_delivery = 'link_token' THEN
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

  INSERT INTO public.order_keys (order_id, license_key_id)
    VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;
  UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;

  RETURN QUERY SELECT v_key_value, v_token;
END;
$function$;