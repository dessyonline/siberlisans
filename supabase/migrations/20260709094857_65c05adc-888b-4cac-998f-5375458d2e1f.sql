ALTER TABLE public.order_discounts
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_discounts_order_product
  ON public.order_discounts(order_id, product_id);

UPDATE public.order_discounts od
SET product_id = fs.product_id
FROM public.flash_sales fs
WHERE od.product_id IS NULL
  AND od.code_snapshot LIKE 'FLASH-%'
  AND substring(fs.id::text, 1, 8) = substring(od.code_snapshot from 7 for 8);

CREATE OR REPLACE FUNCTION public.add_item_to_order(
  _order_id UUID,
  _product_id UUID,
  _quantity INT DEFAULT 1
)
RETURNS TABLE(order_id UUID, total_try NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_prod public.products%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_flash RECORD;
  v_cross RECORD;
  v_unit NUMERIC;
  v_saved NUMERIC := 0;
  v_cross_saved NUMERIC := 0;
  v_new_total NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN _quantity := 1; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'order_locked'; END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = _product_id AND active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;

  IF v_order.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_items.order_id = v_order.id
  ) THEN
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
    SELECT v_order.id, p.id, 1, v_order.price_try, p.name
    FROM public.products p WHERE p.id = v_order.product_id;
    UPDATE public.orders SET product_id = NULL WHERE id = v_order.id;
  END IF;

  v_unit := v_prod.price_try;

  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
  VALUES (v_order.id, v_prod.id, _quantity, v_unit, v_prod.name);

  SELECT id, discount_type, discount_value
    INTO v_flash
    FROM public.flash_sales
    WHERE product_id = v_prod.id
      AND is_active = TRUE
      AND starts_at <= v_now
      AND ends_at > v_now
    ORDER BY
      CASE WHEN discount_type = 'percent'
           THEN v_unit * (discount_value/100.0)
           ELSE discount_value END DESC
    LIMIT 1;

  IF FOUND THEN
    v_saved := CASE
      WHEN v_flash.discount_type = 'percent' THEN v_unit * (v_flash.discount_value/100.0)
      ELSE v_flash.discount_value
    END;
    v_saved := GREATEST(0, LEAST(v_unit, v_saved)) * _quantity;
    IF v_saved > 0 THEN
      INSERT INTO public.order_discounts (order_id, product_id, code_snapshot, discount_try)
      VALUES (v_order.id, v_prod.id, 'FLASH-' || SUBSTRING(v_flash.id::text, 1, 8), ROUND(v_saved::numeric, 2));
    END IF;
  END IF;

  SELECT csr.id, csr.discount_percent, csr.promo_code
    INTO v_cross
    FROM public.cross_sell_rules csr
    WHERE csr.active = TRUE
      AND csr.to_category = v_prod.category
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = v_order.id
          AND oi.product_id <> v_prod.id
          AND p.category = csr.from_category
      )
    ORDER BY csr.discount_percent DESC
    LIMIT 1;

  IF FOUND THEN
    v_cross_saved := ROUND((v_unit * (v_cross.discount_percent / 100.0) * _quantity)::numeric, 2);
    v_cross_saved := GREATEST(0, LEAST(v_unit * _quantity, v_cross_saved));
    IF v_cross_saved > 0 THEN
      INSERT INTO public.order_discounts (order_id, product_id, code_snapshot, discount_try)
      VALUES (
        v_order.id,
        v_prod.id,
        COALESCE(NULLIF(v_cross.promo_code, ''), 'KOMBO-' || SUBSTRING(v_cross.id::text, 1, 8)),
        v_cross_saved
      );
    END IF;
  END IF;

  SELECT COALESCE(SUM(unit_price_try * quantity), 0)
    INTO v_new_total
    FROM public.order_items
    WHERE order_items.order_id = v_order.id;

  UPDATE public.orders
     SET price_try = v_new_total,
         item_count = (SELECT COALESCE(SUM(quantity),0) FROM public.order_items WHERE order_items.order_id = v_order.id),
         updated_at = NOW()
   WHERE id = v_order.id;

  RETURN QUERY SELECT v_order.id, v_new_total;
END;
$$;

REVOKE ALL ON FUNCTION public.add_item_to_order(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_item_to_order(UUID, UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_promo_code(_order_id uuid, _code text)
RETURNS TABLE(discount_try numeric, final_price numeric, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_code record;
  v_discount numeric := 0;
  v_total_discount numeric := 0;
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_promo_code';
  END IF;

  IF v_code.discount_type = 'percent' THEN
    v_discount := round(v_order.price_try * v_code.discount_value / 100.0, 2);
  ELSE
    v_discount := v_code.discount_value;
  END IF;
  v_discount := GREATEST(0, LEAST(v_order.price_try, v_discount));

  DELETE FROM public.order_discounts
  WHERE order_id = v_order.id
    AND code_snapshot NOT LIKE 'FLASH-%'
    AND code_snapshot NOT LIKE 'PUAN-%'
    AND code_snapshot NOT LIKE 'KOMBO-%';

  INSERT INTO public.order_discounts (order_id, promo_code_id, product_id, code_snapshot, discount_try)
  VALUES (v_order.id, v_code.id, v_code.product_id, upper(v_code.code), v_discount);

  UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = v_code.id;

  SELECT COALESCE(SUM(od.discount_try), 0)
    INTO v_total_discount
    FROM public.order_discounts od
    WHERE od.order_id = v_order.id;

  discount_try := v_discount;
  final_price := GREATEST(0, v_order.price_try - v_total_discount);
  code := upper(v_code.code);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_promo_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_promo_code(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_promo_code(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.order_discounts od
  USING public.orders o
  WHERE od.order_id = o.id
    AND o.id = _order_id
    AND o.user_id = v_uid
    AND o.status = 'pending'
    AND od.code_snapshot NOT LIKE 'FLASH-%'
    AND od.code_snapshot NOT LIKE 'PUAN-%'
    AND od.code_snapshot NOT LIKE 'KOMBO-%';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_promo_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_promo_code(uuid) TO authenticated;