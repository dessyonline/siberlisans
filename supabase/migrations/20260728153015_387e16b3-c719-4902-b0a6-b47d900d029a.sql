CREATE OR REPLACE FUNCTION public.apply_for_dealership(_company_name text, _contact_phone text DEFAULT '', _channel text DEFAULT '', _monthly_volume numeric DEFAULT 0, _note text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_bal numeric; v_min numeric := 1000;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF EXISTS (SELECT 1 FROM public.dealers WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Zaten bayisiniz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dealer_applications WHERE user_id = v_uid AND status = 'pending') THEN
    RAISE EXCEPTION 'Bekleyen bir başvurunuz var';
  END IF;
  IF btrim(COALESCE(_company_name,'')) = '' THEN RAISE EXCEPTION 'Firma/rumuz adı gerekli'; END IF;

  SELECT COALESCE(balance_try,0) INTO v_bal FROM public.wallets WHERE user_id = v_uid;
  IF COALESCE(v_bal,0) < v_min THEN
    RAISE EXCEPTION 'Bayilik için cüzdanınızda en az ₺% bakiye olmalı. Mevcut bakiye: ₺%. Bu tutar sizden alınmaz, cüzdanınızda kalır.', v_min, COALESCE(v_bal,0);
  END IF;

  INSERT INTO public.dealer_applications(user_id, company_name, contact_phone, channel, monthly_volume_try, note)
  VALUES (v_uid, left(btrim(_company_name),120), left(COALESCE(_contact_phone,''),40),
          left(COALESCE(_channel,''),60), GREATEST(0, COALESCE(_monthly_volume,0)), left(COALESCE(_note,''),1000))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_dealer_application(_application_id uuid, _approve boolean, _admin_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_app public.dealer_applications%ROWTYPE; v_code text; v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_i int; v_bal numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT * INTO v_app FROM public.dealer_applications WHERE id = _application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Başvuru bulunamadı'; END IF;
  IF v_app.status <> 'pending' THEN RAISE EXCEPTION 'Başvuru zaten sonuçlanmış'; END IF;

  IF _approve THEN
    SELECT COALESCE(balance_try,0) INTO v_bal FROM public.wallets WHERE user_id = v_app.user_id;
    IF COALESCE(v_bal,0) < 1000 THEN
      RAISE EXCEPTION 'Kullanıcının cüzdan bakiyesi ₺1000 altında (₺%). Onaylanamaz.', COALESCE(v_bal,0);
    END IF;
  END IF;

  UPDATE public.dealer_applications
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        admin_note = _admin_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = _application_id;

  IF _approve THEN
    LOOP
      v_code := 'BAYI';
      FOR v_i IN 1..5 LOOP
        v_code := v_code || substr(v_chars, 1 + floor(random()*length(v_chars))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.dealers WHERE code = v_code);
    END LOOP;
    INSERT INTO public.dealers(user_id, code, company_name, approved_by, approved_at, active)
    VALUES (v_app.user_id, v_code, v_app.company_name, auth.uid(), now(), true)
    ON CONFLICT (user_id) DO UPDATE SET active = true, approved_at = now(), approved_by = auth.uid();
  END IF;

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_app.user_id, 'dealer',
    CASE WHEN _approve THEN 'Bayilik başvurun onaylandı' ELSE 'Bayilik başvurun reddedildi' END,
    COALESCE(_admin_note, CASE WHEN _approve THEN 'Bayi panelin aktif, hemen incele.' ELSE 'Daha sonra tekrar başvurabilirsin.' END),
    CASE WHEN _approve THEN '/bayi' ELSE '/bayilik' END);
END; $$;