
CREATE OR REPLACE FUNCTION public.request_affiliate_payout(_amount numeric, _method text, _destination text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _avail numeric; _new numeric; _pid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth'; END IF;
  IF _amount < 50 THEN RAISE EXCEPTION 'min 50 TL'; END IF;
  SELECT balance_try INTO _avail FROM wallets WHERE user_id=_uid FOR UPDATE;
  IF _avail IS NULL OR _avail < _amount THEN RAISE EXCEPTION 'yetersiz bakiye'; END IF;
  _new := _avail - _amount;
  UPDATE wallets SET balance_try=_new WHERE user_id=_uid;
  INSERT INTO wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (_uid, 'purchase', _amount, _new, 'Partner ödeme talebi (' || _method || ')');
  INSERT INTO affiliate_payouts(user_id, amount_try, method, destination)
    VALUES (_uid, _amount, _method, _destination) RETURNING id INTO _pid;
  RETURN _pid;
END; $$;
