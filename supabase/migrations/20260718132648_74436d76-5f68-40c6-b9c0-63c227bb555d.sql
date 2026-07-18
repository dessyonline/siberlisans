
CREATE OR REPLACE FUNCTION public.charge_ai_enhance(_price_try numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal numeric;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _price_try IS NULL OR _price_try <= 0 THEN
    RAISE EXCEPTION 'invalid_price';
  END IF;

  INSERT INTO public.wallets(user_id, balance_try)
  VALUES (_uid, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
     SET balance_try = balance_try - _price_try,
         updated_at = now()
   WHERE user_id = _uid
     AND balance_try >= _price_try
  RETURNING balance_try INTO _bal;

  IF _bal IS NULL THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO public.wallet_transactions(user_id, amount_try, type, description, created_at)
  VALUES (_uid, -_price_try, 'ai_enhance', 'AI resim iyileştirme', now());

  RETURN jsonb_build_object('balance_try', _bal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.charge_ai_enhance(numeric) TO authenticated;
