
CREATE OR REPLACE FUNCTION public.refund_order_to_wallet(_order_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_owner UUID; v_price NUMERIC(12,2); v_discount NUMERIC(12,2) := 0;
  v_final NUMERIC(12,2); v_paid TEXT; v_balance NUMERIC(12,2); v_already INT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT user_id, price_try, paid_with INTO v_owner, v_price, v_paid
  FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_paid <> 'wallet' THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_already FROM public.wallet_transactions
    WHERE order_id = _order_id AND kind = 'refund';
  IF v_already > 0 THEN RAISE EXCEPTION 'Bu sipariş zaten iade edilmiş'; END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_discount
  FROM public.order_discounts WHERE order_id = _order_id;
  v_final := GREATEST(0, v_price - v_discount);

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_owner, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_final, updated_at = now()
    WHERE user_id = v_owner RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
  VALUES (v_owner, 'refund', v_final, v_balance, _order_id, 'Sipariş iptali iadesi', auth.uid());

  RETURN v_balance;
END; $function$;
