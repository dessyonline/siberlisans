CREATE OR REPLACE FUNCTION public.credit_crypto_deposit(
  _user_id uuid, _tx_hash text, _amount_usdt numeric, _rate numeric,
  _from_address text, _to_address text, _block_timestamp timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amount_try numeric; v_deposit_id uuid; v_new_balance numeric;
BEGIN
  v_amount_try := round((_amount_usdt * _rate)::numeric, 2);

  INSERT INTO public.crypto_deposits (user_id, tx_hash, amount_usdt, rate_used, amount_try, from_address, to_address, status, block_timestamp)
    VALUES (_user_id, _tx_hash, _amount_usdt, _rate, v_amount_try, _from_address, _to_address, 'confirmed', _block_timestamp)
    RETURNING id INTO v_deposit_id;

  INSERT INTO public.wallets (user_id, balance_try) VALUES (_user_id, 0) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets SET balance_try = balance_try + v_amount_try, updated_at = now()
    WHERE user_id = _user_id
    RETURNING balance_try INTO v_new_balance;

  INSERT INTO public.wallet_transactions (user_id, kind, amount_try, balance_after, note)
    VALUES (_user_id, 'topup', v_amount_try, v_new_balance,
      'USDT-TRC20: ' || _amount_usdt::text || ' USDT @ ' || _rate::text);

  INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_user_id, 'wallet_topup', 'Cüzdan yüklendi',
      v_amount_try::text || ' ₺ (' || _amount_usdt::text || ' USDT) hesabınıza geçti.', '/cuzdan');

  RETURN v_deposit_id;
END; $$;
REVOKE ALL ON FUNCTION public.credit_crypto_deposit(uuid,text,numeric,numeric,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_crypto_deposit(uuid,text,numeric,numeric,text,text,timestamptz) TO service_role;