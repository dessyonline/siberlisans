
-- Bekleyen siparişten ürün çıkarma ve siparişi iptal etme
CREATE OR REPLACE FUNCTION public.remove_item_from_order(_order_id uuid, _item_id uuid)
RETURNS TABLE(order_id uuid, total_try numeric, items_left int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_status text;
  v_removed numeric;
  v_prod uuid;
  v_left int;
  v_new_total numeric;
BEGIN
  SELECT o.user_id, o.status INTO v_user, v_status
  FROM public.orders o WHERE o.id = _order_id;

  IF v_user IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_user <> auth.uid() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_status NOT IN ('pending','reviewing') THEN
    RAISE EXCEPTION 'Bu sipariş artık düzenlenemez';
  END IF;

  SELECT (unit_price_try * quantity), product_id
    INTO v_removed, v_prod
  FROM public.order_items
  WHERE id = _item_id AND order_id = _order_id;

  IF v_removed IS NULL THEN RAISE EXCEPTION 'Kalem bulunamadı'; END IF;

  DELETE FROM public.order_items WHERE id = _item_id;

  -- ürüne bağlı indirimleri temizle
  IF v_prod IS NOT NULL THEN
    DELETE FROM public.order_discounts
      WHERE order_id = _order_id AND product_id = v_prod;
  END IF;

  SELECT COUNT(*) INTO v_left FROM public.order_items WHERE order_id = _order_id;

  IF v_left = 0 THEN
    -- Son kalem çıkarıldıysa siparişi iptal et
    UPDATE public.orders SET status = 'rejected', updated_at = now()
      WHERE id = _order_id;
    DELETE FROM public.order_discounts WHERE order_id = _order_id;
    RETURN QUERY SELECT _order_id, 0::numeric, 0;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(unit_price_try * quantity),0) INTO v_new_total
  FROM public.order_items WHERE order_id = _order_id;

  UPDATE public.orders
    SET price_try = v_new_total, updated_at = now()
    WHERE id = _order_id;

  RETURN QUERY SELECT _order_id, v_new_total, v_left;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pending_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_status text;
BEGIN
  SELECT user_id, status INTO v_user, v_status
    FROM public.orders WHERE id = _order_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_user <> auth.uid() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Sadece bekleyen sipariş iptal edilebilir'; END IF;

  DELETE FROM public.order_discounts WHERE order_id = _order_id;
  UPDATE public.orders SET status = 'rejected', updated_at = now()
    WHERE id = _order_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_item_from_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_order(uuid) TO authenticated;
