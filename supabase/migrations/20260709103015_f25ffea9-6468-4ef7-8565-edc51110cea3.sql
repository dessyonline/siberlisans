
CREATE OR REPLACE FUNCTION public.create_cart_order(_items jsonb, _coupon_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, reference_code text, total_try numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_available int;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_ref text;
  v_order_id uuid;
  v_count int;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i int;
  v_coupon_id uuid := NULL;
  v_coupon_code text := NULL;
  v_coupon record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Sepet boş'; END IF;
  IF jsonb_array_length(_items) > 20 THEN RAISE EXCEPTION 'En fazla 20 farklı ürün eklenebilir'; END IF;

  v_ref := 'SBR-';
  FOR v_i IN 1..8 LOOP
    v_ref := v_ref || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  END LOOP;

  v_count := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Geçersiz adet'; END IF;
    SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'productId')::uuid AND active = true;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Ürün bulunamadı veya pasif'; END IF;
    IF NOT v_product.manual_fulfillment AND NOT v_product.unlimited_stock THEN
      SELECT COUNT(*) INTO v_available FROM public.license_keys
        WHERE product_id = v_product.id AND status = 'available';
      IF v_available < v_qty THEN
        RAISE EXCEPTION '"%": stokta yeterli anahtar yok (% adet mevcut, % isteniyor)',
          v_product.name, v_available, v_qty;
      END IF;
    END IF;
    v_subtotal := v_subtotal + (v_product.price_try * v_qty);
    v_count := v_count + v_qty;
  END LOOP;

  IF _coupon_code IS NOT NULL AND btrim(_coupon_code) <> '' THEN
    SELECT * INTO v_coupon FROM public.validate_coupon(_coupon_code, v_subtotal);
    IF NOT FOUND OR v_coupon.coupon_id IS NULL THEN
      RAISE EXCEPTION 'Geçersiz kupon';
    END IF;
    v_coupon_id := v_coupon.coupon_id;
    v_coupon_code := v_coupon.code;
    v_discount := v_coupon.discount_try;
  END IF;

  v_total := GREATEST(0, v_subtotal - v_discount);

  INSERT INTO public.orders (user_id, product_id, price_try, reference_code, status, item_count)
    VALUES (v_uid, NULL, v_total, v_ref, 'pending', v_count)
    RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'productId')::uuid;
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
      VALUES (v_order_id, v_product.id, v_qty, v_product.price_try, v_product.name);
  END LOOP;

  IF v_coupon_id IS NOT NULL AND v_discount > 0 THEN
    INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id, discount_try)
      VALUES (v_coupon_id, v_uid, v_order_id, v_discount);
    UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon_id;
    INSERT INTO public.order_discounts (order_id, code_snapshot, discount_try)
      VALUES (v_order_id, v_coupon_code, v_discount);
  END IF;

  RETURN QUERY SELECT v_order_id, v_ref, v_total;
END; $function$;
