CREATE OR REPLACE FUNCTION public.request_affiliate_payout(_amount numeric, _method text, _destination text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _pending int;
  _earned numeric;
  _paid numeric;
  _pending_amt numeric;
  _available numeric;
  _pid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth'; END IF;
  IF _amount < 50 THEN RAISE EXCEPTION 'min 50 TL'; END IF;

  -- Sadece bekleyen 1 talep olabilir
  SELECT count(*) INTO _pending
  FROM affiliate_payouts
  WHERE user_id = _uid AND status IN ('pending','approved');
  IF _pending > 0 THEN
    RAISE EXCEPTION 'Zaten bekleyen bir talebiniz var. Sonuçlanmasını bekleyin.';
  END IF;

  -- Sadece partner kazancından talep edilebilir
  SELECT
    coalesce(total_earned,0),
    coalesce(total_paid,0),
    coalesce(pending,0)
  INTO _earned, _paid, _pending_amt
  FROM affiliate_stats(_uid);

  _available := _earned - _paid - _pending_amt;
  IF _amount > _available THEN
    RAISE EXCEPTION 'Talep tutarı kazancınızdan fazla. Uygun: %', _available;
  END IF;

  INSERT INTO affiliate_payouts(user_id, amount_try, method, destination)
    VALUES (_uid, _amount, 'wallet', coalesce(_destination,''))
    RETURNING id INTO _pid;

  RETURN _pid;
END; $function$;