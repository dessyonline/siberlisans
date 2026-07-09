
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
  v_unit NUMERIC;
  v_saved NUMERIC := 0;
  v_new_total NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN _quantity := 1; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'order_locked'; END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = _product_id AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;

  -- Tekil sipariş → cart siparişine çevir: mevcut product'ı order_items'a taşı
  IF v_order.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_items.order_id = v_order.id
  ) THEN
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
    SELECT v_order.id, p.id, 1, v_order.price_try, p.name
    FROM public.products p WHERE p.id = v_order.product_id;
    UPDATE public.orders SET product_id = NULL WHERE id = v_order.id;
  END IF;

  v_unit := v_prod.price_try;

  -- Yeni kalemi ekle
  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
  VALUES (v_order.id, v_prod.id, _quantity, v_unit, v_prod.name);

  -- Aktif flash indirim varsa uygula
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
      INSERT INTO public.order_discounts (order_id, code_snapshot, discount_try)
      VALUES (v_order.id, 'FLASH-' || SUBSTRING(v_flash.id::text, 1, 8), ROUND(v_saved::numeric, 2));
    END IF;
  END IF;

  -- price_try'yi item toplamına eşitle
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
