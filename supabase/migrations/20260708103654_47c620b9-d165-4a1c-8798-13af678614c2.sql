
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

  SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
  FROM public.license_keys lk
  WHERE lk.product_id = v_product_id AND lk.status = 'available'
  ORDER BY lk.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

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
    UPDATE public.license_keys lk
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
          activation_token = COALESCE(lk.activation_token, v_token)
      WHERE lk.id = v_key_id
      RETURNING lk.activation_token INTO v_token;
  ELSE
    UPDATE public.license_keys lk
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
      WHERE lk.id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id)
  VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_key_value, v_token;
END; $function$;
REVOKE ALL ON FUNCTION public._assign_key_to_order(UUID) FROM PUBLIC, anon, authenticated;
