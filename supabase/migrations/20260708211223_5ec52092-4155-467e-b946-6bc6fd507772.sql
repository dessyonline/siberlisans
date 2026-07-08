
-- 1) support_messages: auto-fill sender_id + is_admin
CREATE OR REPLACE FUNCTION public.tg_support_message_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.sender_id := auth.uid();
    NEW.is_admin := public.has_role(auth.uid(),'admin');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS support_message_defaults ON public.support_messages;
CREATE TRIGGER support_message_defaults BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_message_defaults();

DROP POLICY IF EXISTS "send messages to accessible tickets" ON public.support_messages;
CREATE POLICY "send messages to accessible tickets" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
    )
  );

-- 2) Referral: 300 TL alışveriş şartı, 10 TL çift taraflı, referrer başına max 5
CREATE OR REPLACE FUNCTION public.process_referral_bonus(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referrer uuid;
  v_paid boolean;
  v_bonus numeric(12,2) := 10.00;
  v_min numeric(12,2) := 300.00;
  v_rewarded int;
  v_final numeric(12,2);
  v_bal_new numeric(12,2);
  v_bal_ref numeric(12,2);
BEGIN
  SELECT referred_by, referral_bonus_paid INTO v_referrer, v_paid
    FROM public.profiles WHERE id = _user_id;
  IF v_referrer IS NULL OR v_paid THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_rewarded FROM public.profiles
    WHERE referred_by = v_referrer AND referral_bonus_paid = true;
  IF v_rewarded >= 5 THEN RETURN; END IF;

  SELECT GREATEST(0, o.price_try - COALESCE((SELECT SUM(discount_try) FROM public.order_discounts WHERE order_id = o.id),0))
    INTO v_final
    FROM public.orders o
    WHERE o.user_id = _user_id AND o.status = 'approved'
    ORDER BY o.approved_at DESC NULLS LAST
    LIMIT 1;
  IF COALESCE(v_final,0) < v_min THEN RETURN; END IF;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_bonus, updated_at = now()
    WHERE user_id = _user_id RETURNING balance_try INTO v_bal_new;
  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (_user_id, 'referral_bonus', v_bonus, v_bal_new, 'Davet bonusu (davet edilen, 300₺+ alışveriş)');

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_referrer, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_bonus, updated_at = now()
    WHERE user_id = v_referrer RETURNING balance_try INTO v_bal_ref;
  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (v_referrer, 'referral_bonus', v_bonus, v_bal_ref, 'Davet bonusu (davet eden, 300₺+ alışveriş)');

  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (v_referrer, 'referral_bonus', 'Davet bonusu kazandın 🎉',
      '10 ₺ cüzdanına eklendi (davet ettiğin kullanıcı 300₺+ alışveriş yaptı).', '/cuzdan');

  UPDATE public.profiles SET referral_bonus_paid = true WHERE id = _user_id;
END $$;

-- 3) Eski %10 komisyon tetikleyicisi devre dışı
DROP TRIGGER IF EXISTS trg_referral_commission ON public.orders;
