
CREATE OR REPLACE FUNCTION public.cancel_pending_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_user uuid; v_status text;
BEGIN
  SELECT user_id, status INTO v_user, v_status
    FROM public.orders WHERE id = _order_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_user <> auth.uid() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Sadece bekleyen sipariş iptal edilebilir'; END IF;
  DELETE FROM public.order_discounts WHERE order_id = _order_id;
  UPDATE public.orders SET status = 'cancelled', updated_at = now()
    WHERE id = _order_id;
  RETURN true;
END;
$$;
