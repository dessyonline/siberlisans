CREATE OR REPLACE FUNCTION public.apply_promo_code(_order_id uuid, _code text)
 RETURNS TABLE(discount_try numeric, final_price numeric, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_pc record;
  v_cp record;
  v_discount numeric := 0;
  v_total_discount numeric := 0;
  v_code_str text;
  v_source text;
  v_promo_id uuid := NULL;
  v_product_id uuid := NULL;
  v_norm text := upper(trim(_code));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id AND user_id = v_uid AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- 1) promo_codes: önce kodu bul (koşullardan bağımsız), sonra sırayla kontrol et
  SELECT * INTO v_pc
  FROM public.promo_codes
  WHERE upper(code) = v_norm
  LIMIT 1;

  IF FOUND THEN
    IF v_pc.active IS NOT TRUE THEN
      RAISE EXCEPTION 'kod_pasif';
    END IF;
    IF v_pc.expires_at IS NOT NULL AND v_pc.expires_at <= now() THEN
      RAISE EXCEPTION 'kod_suresi_dolmus';
    END IF;
    IF v_pc.max_uses IS NOT NULL AND v_pc.used_count >= v_pc.max_uses THEN
      RAISE EXCEPTION 'kod_limit_dolmus';
    END IF;
    IF COALESCE(v_pc.min_amount, 0) > v_order.price_try THEN
      RAISE EXCEPTION 'kod_min_tutar:%', v_pc.min_amount;
    END IF;
    IF v_pc.product_id IS NOT NULL
       AND v_pc.product_id <> v_order.product_id
       AND NOT EXISTS (
         SELECT 1 FROM public.order_items oi
         WHERE oi.order_id = v_order.id AND oi.product_id = v_pc.product_id
       ) THEN
      RAISE EXCEPTION 'kod_urun_uyumsuz';
    END IF;

    v_source := 'promo';
    IF v_pc.discount_type = 'percent' THEN
      v_discount := round(v_order.price_try * v_pc.discount_value / 100.0, 2);
    ELSE
      v_discount := v_pc.discount_value;
    END IF;
    v_code_str := upper(v_pc.code);
    v_promo_id := v_pc.id;
    v_product_id := v_pc.product_id;
  ELSE
    -- 2) coupons tablosu
    SELECT * INTO v_cp
    FROM public.coupons
    WHERE upper(code) = v_norm
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'kod_bulunamadi';
    END IF;

    IF v_cp.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'kod_pasif';
    END IF;
    IF v_cp.expires_at IS NOT NULL AND v_cp.expires_at <= now() THEN
      RAISE EXCEPTION 'kod_suresi_dolmus';
    END IF;
    IF v_cp.max_uses IS NOT NULL AND v_cp.used_count >= v_cp.max_uses THEN
      RAISE EXCEPTION 'kod_limit_dolmus';
    END IF;
    IF COALESCE(v_cp.min_order_try, 0) > v_order.price_try THEN
      RAISE EXCEPTION 'kod_min_tutar:%', v_cp.min_order_try;
    END IF;

    v_source := 'coupon';
    IF v_cp.discount_type = 'percent' THEN
      v_discount := round(v_order.price_try * v_cp.discount_value / 100.0, 2);
    ELSE
      v_discount := v_cp.discount_value;
    END IF;
    v_code_str := upper(v_cp.code);
  END IF;

  v_discount := GREATEST(0, LEAST(v_order.price_try, v_discount));

  DELETE FROM public.order_discounts
  WHERE order_id = v_order.id
    AND code_snapshot NOT LIKE 'FLASH-%'
    AND code_snapshot NOT LIKE 'PUAN-%'
    AND code_snapshot NOT LIKE 'KOMBO-%';

  INSERT INTO public.order_discounts (order_id, promo_code_id, product_id, code_snapshot, discount_try)
  VALUES (v_order.id, v_promo_id, v_product_id, v_code_str, v_discount);

  IF v_source = 'promo' THEN
    UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
  ELSE
    UPDATE public.coupons SET used_count = used_count + 1 WHERE upper(code) = v_code_str;
  END IF;

  SELECT COALESCE(SUM(od.discount_try), 0)
    INTO v_total_discount
    FROM public.order_discounts od
    WHERE od.order_id = v_order.id;

  discount_try := v_discount;
  final_price := GREATEST(0, v_order.price_try - v_total_discount);
  code := v_code_str;
  RETURN NEXT;
END;
$function$;