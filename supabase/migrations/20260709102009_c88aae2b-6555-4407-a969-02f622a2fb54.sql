DROP FUNCTION IF EXISTS public.add_item_to_order(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.add_item_to_order(
  _order_id UUID,
  _product_id UUID,
  _quantity INT DEFAULT 1
)
RETURNS TABLE(out_order_id UUID, out_total_try NUMERIC)
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

  SELECT * INTO v_order FROM public.orders o WHERE o.id = _order_id AND o.user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'order_locked'; END IF;

  SELECT * INTO v_prod FROM public.products p WHERE p.id = _product_id AND p.active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;

  IF v_order.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi WHERE oi.order_id = v_order.id
  ) THEN
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
    SELECT v_order.id, p.id, 1, v_order.price_try, p.name
    FROM public.products p WHERE p.id = v_order.product_id;
    UPDATE public.orders SET product_id = NULL WHERE id = v_order.id;
  END IF;

  v_unit := v_prod.price_try;

  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
  VALUES (v_order.id, v_prod.id, _quantity, v_unit, v_prod.name);

  SELECT fs.id, fs.discount_type, fs.discount_value
    INTO v_flash
    FROM public.flash_sales fs
    WHERE fs.product_id = v_prod.id
      AND fs.is_active = TRUE
      AND fs.starts_at <= v_now
      AND fs.ends_at > v_now
    ORDER BY
      CASE WHEN fs.discount_type = 'percent'
           THEN v_unit * (fs.discount_value/100.0)
           ELSE fs.discount_value END DESC
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

  SELECT COALESCE(SUM(oi.unit_price_try * oi.quantity), 0)
    INTO v_new_total
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id;

  UPDATE public.orders
     SET price_try = v_new_total,
         item_count = (SELECT COALESCE(SUM(oi.quantity),0) FROM public.order_items oi WHERE oi.order_id = v_order.id),
         updated_at = NOW()
   WHERE id = v_order.id;

  out_order_id := v_order.id;
  out_total_try := v_new_total;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.add_item_to_order(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_item_to_order(UUID, UUID, INT) TO authenticated;