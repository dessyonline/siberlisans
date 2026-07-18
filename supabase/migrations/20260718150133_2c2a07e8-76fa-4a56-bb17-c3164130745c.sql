
CREATE OR REPLACE FUNCTION public.charge_ai_enhance(_price_try numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal numeric;
  _sub public.ai_subscriptions;
  _from_sub numeric := 0;
  _from_wallet numeric := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _price_try IS NULL OR _price_try <= 0 THEN
    RAISE EXCEPTION 'invalid_price';
  END IF;

  -- 1. Önce aktif abonelik kredisinden düş
  SELECT * INTO _sub
    FROM public.ai_subscriptions
    WHERE user_id = _uid
      AND status = 'active'
      AND expires_at > now()
    ORDER BY expires_at DESC
    LIMIT 1
    FOR UPDATE;

  IF _sub.id IS NOT NULL AND _sub.credits_remaining > 0 THEN
    _from_sub := LEAST(_price_try, _sub.credits_remaining);
    UPDATE public.ai_subscriptions
       SET credits_remaining = credits_remaining - _from_sub
     WHERE id = _sub.id;
  END IF;

  _from_wallet := _price_try - _from_sub;

  -- 2. Kalanı cüzdandan düş
  IF _from_wallet > 0 THEN
    INSERT INTO public.wallets(user_id, balance_try)
    VALUES (_uid, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.wallets
       SET balance_try = balance_try - _from_wallet,
           updated_at = now()
     WHERE user_id = _uid
       AND balance_try >= _from_wallet
    RETURNING balance_try INTO _bal;

    IF _bal IS NULL THEN
      -- Yetersizse abonelikten düşülen krediyi geri iade et
      IF _from_sub > 0 THEN
        UPDATE public.ai_subscriptions
           SET credits_remaining = credits_remaining + _from_sub
         WHERE id = _sub.id;
      END IF;
      RAISE EXCEPTION 'insufficient_balance';
    END IF;

    INSERT INTO public.wallet_transactions(user_id, amount_try, type, description, created_at)
    VALUES (_uid, -_from_wallet, 'ai_enhance',
            'AI resim iyileştirme' || CASE WHEN _from_sub > 0 THEN ' (paket + cüzdan)' ELSE '' END,
            now());
  ELSE
    SELECT balance_try INTO _bal FROM public.wallets WHERE user_id = _uid;
  END IF;

  RETURN jsonb_build_object(
    'balance_try', COALESCE(_bal, 0),
    'from_sub', _from_sub,
    'from_wallet', _from_wallet
  );
END;
$$;
