CREATE OR REPLACE FUNCTION public.apply_promo_code(_order_id uuid, _code text)
 RETURNS TABLE(discount_try numeric, final_price numeric, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_code record;
  v_coupon record;
  v_discount numeric := 0;
  v_total_discount numeric := 0;
  v_code_str text;
  v_source text;
  v_promo_id uuid := NULL;
  v_product_id uuid := NULL;
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

  -- 1) promo_codes tablosunda ara
  SELECT * INTO v_code
  FROM public.promo_codes
  WHERE upper(promo_codes.code) = upper(trim(_code))
    AND active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR used_count < max_uses)
    AND COALESCE(min_amount, 0) <= v_order.price_try
    AND (
      product_id IS NULL
      OR product_id = v_order.product_id
      OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = v_order.id AND oi.product_id = promo_codes.product_id)
    )
  LIMIT 1;

  IF FOUND THEN
    v_source := 'promo';
    IF v_code.discount_type = 'percent' THEN
      v_discount := round(v_order.price_try * v_code.discount_value / 100.0, 2);
    ELSE
      v_discount := v_code.discount_value;
    END IF;
    v_code_str := upper(v_code.code);
    v_promo_id := v_code.id;
    v_product_id := v_code.product_id;
  ELSE
    -- 2) coupons tablosunda ara (admin/kuponlar sayfası)
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE upper(coupons.code) = upper(trim(_code))
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR used_count < max_uses)
      AND COALESCE(min_order_try, 0) <= v_order.price_try
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_promo_code';
    END IF;

    v_source := 'coupon';
    IF v_coupon.discount_type = 'percent' THEN
      v_discount := round(v_order.price_try * v_coupon.discount_value / 100.0, 2);
    ELSE
      v_discount := v_coupon.discount_value;
    END IF;
    v_code_str := upper(v_coupon.code);
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