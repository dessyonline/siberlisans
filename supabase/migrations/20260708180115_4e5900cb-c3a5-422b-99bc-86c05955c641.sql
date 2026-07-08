CREATE OR REPLACE FUNCTION public.refund_points_discount(_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_disc RECORD;
  v_amount INTEGER;
  v_new INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_order.status NOT IN ('pending','reviewing') THEN
    RAISE EXCEPTION 'Bu aşamada iade edilemez';
  END IF;

  SELECT * INTO v_disc FROM public.order_discounts
    WHERE order_id = _order_id AND code_snapshot LIKE 'PUAN-%';
  IF v_disc IS NULL THEN RETURN NULL; END IF;

  v_amount := NULLIF(regexp_replace(v_disc.code_snapshot, '^PUAN-', ''), '')::int;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    DELETE FROM public.order_discounts WHERE order_id = _order_id AND code_snapshot = v_disc.code_snapshot;
    RETURN 0;
  END IF;

  UPDATE public.profiles
    SET total_points = total_points + v_amount,
        tier = public.compute_tier(total_points + v_amount)
    WHERE id = v_uid RETURNING total_points INTO v_new;

  INSERT INTO public.user_points_ledger(user_id, delta, reason, order_id, balance_after)
    VALUES (v_uid, v_amount, 'puan iadesi', _order_id, v_new);

  DELETE FROM public.order_discounts WHERE order_id = _order_id AND code_snapshot = v_disc.code_snapshot;
  RETURN v_amount;
END; $$;