CREATE OR REPLACE FUNCTION public.process_referral_bonus(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referrer uuid;
  v_paid boolean;
  v_min numeric(12,2) := 300.00;
  v_cap numeric(12,2) := 40.00;
  v_pct numeric(6,4) := 0.05;
  v_rewarded int;
  v_total numeric(12,2);
  v_bonus numeric(12,2);
  v_bal_ref numeric(12,2);
  v_code text;
BEGIN
  SELECT referred_by, referral_bonus_paid INTO v_referrer, v_paid
    FROM public.profiles WHERE id = _user_id;
  IF v_referrer IS NULL OR v_paid THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_rewarded FROM public.profiles
    WHERE referred_by = v_referrer AND referral_bonus_paid = true;
  IF v_rewarded >= 5 THEN RETURN; END IF;

  SELECT COALESCE(SUM(GREATEST(0, o.price_try - COALESCE((SELECT SUM(discount_try) FROM public.order_discounts WHERE order_id = o.id),0))), 0)
    INTO v_total
    FROM public.orders o
    WHERE o.user_id = _user_id AND o.status = 'approved';

  IF v_total < v_min THEN RETURN; END IF;

  v_bonus := LEAST(v_cap, ROUND(v_total * v_pct, 2));
  IF v_bonus <= 0 THEN RETURN; END IF;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_referrer, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_bonus, updated_at = now()
    WHERE user_id = v_referrer RETURNING balance_try INTO v_bal_ref;
  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (v_referrer, 'referral_bonus', v_bonus, v_bal_ref,
            format('Davet bonusu (%%%s nakit, cap ₺%s)', (v_pct*100)::int, v_cap::int));

  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (v_referrer, 'referral_bonus', 'Davet bonusu kazandın 🎉',
      format('₺%s cüzdanına eklendi (davet ettiğin kullanıcı toplam ₺%s alışveriş yaptı).', v_bonus, v_total), '/cuzdan');

  v_code := 'REF-' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8));
  INSERT INTO public.coupons(code, discount_type, discount_value, min_order_try, max_uses, used_count, expires_at, is_active, user_id)
    VALUES (v_code, 'amount', v_bonus, 100, 1, 0, now() + interval '90 days', true, _user_id);

  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (_user_id, 'referral_bonus', 'Hoşgeldin kuponun hazır 🎁',
      format('₺%s değerinde tek kullanımlık kupon: %s (min ₺100, 90 gün geçerli)', v_bonus, v_code),
      '/cuzdan');

  UPDATE public.profiles SET referral_bonus_paid = true WHERE id = _user_id;
END $function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.id FROM public.profiles p
           WHERE p.referred_by IS NOT NULL AND p.referral_bonus_paid = false
  LOOP
    PERFORM public.process_referral_bonus(r.id);
  END LOOP;
END $$;