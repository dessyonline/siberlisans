-- helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.crypto_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trc20_address text NOT NULL DEFAULT '',
  usdt_try_rate numeric,
  min_amount_usdt numeric NOT NULL DEFAULT 5,
  enabled boolean NOT NULL DEFAULT false,
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crypto_settings TO authenticated;
GRANT ALL ON public.crypto_settings TO service_role;
ALTER TABLE public.crypto_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read settings" ON public.crypto_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage settings" ON public.crypto_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_crypto_settings_updated BEFORE UPDATE ON public.crypto_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.crypto_settings (singleton) VALUES (true);

CREATE TABLE public.crypto_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_hash text NOT NULL UNIQUE,
  amount_usdt numeric NOT NULL CHECK (amount_usdt > 0),
  rate_used numeric NOT NULL CHECK (rate_used > 0),
  amount_try numeric NOT NULL CHECK (amount_try > 0),
  from_address text,
  to_address text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','rejected')),
  block_timestamp timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crypto_deposits_user_idx ON public.crypto_deposits(user_id, created_at DESC);
GRANT SELECT ON public.crypto_deposits TO authenticated;
GRANT ALL ON public.crypto_deposits TO service_role;
ALTER TABLE public.crypto_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own deposits" ON public.crypto_deposits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manages deposits" ON public.crypto_deposits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.credit_crypto_deposit(
  _user_id uuid, _tx_hash text, _amount_usdt numeric, _rate numeric,
  _from_address text, _to_address text, _block_timestamp timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amount_try numeric; v_deposit_id uuid; v_wallet_id uuid;
BEGIN
  v_amount_try := round((_amount_usdt * _rate)::numeric, 2);
  INSERT INTO public.crypto_deposits (user_id, tx_hash, amount_usdt, rate_used, amount_try, from_address, to_address, status, block_timestamp)
    VALUES (_user_id, _tx_hash, _amount_usdt, _rate, v_amount_try, _from_address, _to_address, 'confirmed', _block_timestamp)
    RETURNING id INTO v_deposit_id;
  INSERT INTO public.wallets (user_id, balance) VALUES (_user_id, 0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance = balance + v_amount_try WHERE user_id = _user_id RETURNING id INTO v_wallet_id;
  INSERT INTO public.wallet_transactions (wallet_id, user_id, amount, type, description, reference_id)
    VALUES (v_wallet_id, _user_id, v_amount_try, 'topup',
      'USDT-TRC20 yükleme (' || _amount_usdt::text || ' USDT @ ' || _rate::text || ')', v_deposit_id);
  INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_user_id, 'wallet_topup', 'Cüzdan yüklendi',
      v_amount_try::text || ' ₺ (' || _amount_usdt::text || ' USDT) hesabınıza geçti.', '/hesabim');
  RETURN v_deposit_id;
END; $$;
REVOKE ALL ON FUNCTION public.credit_crypto_deposit(uuid,text,numeric,numeric,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_crypto_deposit(uuid,text,numeric,numeric,text,text,timestamptz) TO service_role;