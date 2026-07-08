
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shopier_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shopier_order_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_shopier_order_id_key ON public.orders(shopier_order_id) WHERE shopier_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.approve_shopier_order(
  _shopier_order_id text,
  _buyer_email text,
  _amount numeric
) RETURNS TABLE(order_id uuid, matched boolean, already boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_order_id uuid;
  v_status public.order_status;
  v_disc numeric := 0;
  v_final numeric;
BEGIN
  -- Idempotency: aynı shopier siparişi tekrar gelirse
  SELECT o.id, o.status INTO v_order_id, v_status
  FROM public.orders o WHERE o.shopier_order_id = _shopier_order_id LIMIT 1;
  IF v_order_id IS NOT NULL THEN
    order_id := v_order_id; matched := true; already := true; RETURN NEXT; RETURN;
  END IF;

  -- Alıcıyı e-posta ile bul
  SELECT p.id INTO v_uid FROM public.profiles p WHERE lower(p.email) = lower(_buyer_email) LIMIT 1;
  IF v_uid IS NULL THEN
    order_id := NULL; matched := false; already := false; RETURN NEXT; RETURN;
  END IF;

  -- Bu kullanıcının bekleyen siparişleri arasından tutarı eşleşen en yenisini bul (son 24 saat)
  FOR v_order_id, v_final IN
    SELECT o.id,
           GREATEST(0, o.price_try - COALESCE((SELECT SUM(discount_try) FROM public.order_discounts WHERE order_id = o.id),0))
    FROM public.orders o
    WHERE o.user_id = v_uid
      AND o.status IN ('pending','reviewing')
      AND o.created_at > now() - interval '24 hours'
    ORDER BY o.created_at DESC
  LOOP
    IF ABS(v_final - _amount) < 0.05 THEN
      UPDATE public.orders
        SET status = 'approved', approved_at = now(),
            paid_with = 'shopier', shopier_order_id = _shopier_order_id, updated_at = now()
        WHERE id = v_order_id;
      PERFORM public._assign_key_to_order(v_order_id);
      order_id := v_order_id; matched := true; already := false; RETURN NEXT; RETURN;
    END IF;
  END LOOP;

  order_id := NULL; matched := false; already := false; RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.approve_shopier_order(text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_shopier_order(text, text, numeric) TO service_role;
