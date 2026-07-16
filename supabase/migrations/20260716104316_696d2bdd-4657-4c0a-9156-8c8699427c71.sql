
CREATE OR REPLACE FUNCTION public.validate_license(_key text, _hwid text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.license_keys%ROWTYPE;
  v_key TEXT; v_hwid TEXT;
  v_minutes INTEGER;
  v_email TEXT; v_name TEXT; v_email_masked TEXT;
BEGIN
  v_key := upper(btrim(coalesce(_key,'')));
  v_hwid := btrim(coalesce(_hwid,''));
  IF v_key = '' OR v_hwid = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Geçersiz istek.');
  END IF;

  SELECT * INTO v_row FROM public.license_keys WHERE upper(key_value) = v_key FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('valid', false, 'error', 'Lisans bulunamadı.'); END IF;
  IF v_row.revoked THEN RETURN jsonb_build_object('valid', false, 'error', 'Lisans iptal edildi.'); END IF;

  -- HWID henüz yoksa: bu cihaza otomatik bağla (tek adımlı validate+activate)
  IF v_row.hwid IS NULL THEN
    v_minutes := COALESCE(
      v_row.duration_minutes,
      v_row.duration_days * 1440,
      (SELECT default_license_days * 1440 FROM public.products WHERE id = v_row.product_id)
    );
    UPDATE public.license_keys
      SET hwid = v_hwid,
          activated_at = COALESCE(activated_at, now()),
          expires_at = CASE WHEN expires_at IS NOT NULL THEN expires_at
            WHEN v_minutes IS NOT NULL THEN now() + (v_minutes || ' minutes')::interval ELSE NULL END,
          duration_minutes = COALESCE(duration_minutes, v_minutes),
          last_validated_at = now()
      WHERE id = v_row.id RETURNING * INTO v_row;
  ELSIF v_row.hwid <> v_hwid THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Bu lisans başka bir cihaza kilitli.');
  ELSE
    UPDATE public.license_keys SET last_validated_at = now() WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans süreniz doldu.');
  END IF;

  SELECT p.email, p.display_name INTO v_email, v_name
  FROM public.orders o JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = v_row.assigned_order_id;

  IF v_email IS NOT NULL THEN
    v_email_masked := regexp_replace(v_email, '^(.{1,2}).*(@.*)$', '\1***\2');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'minutes_left', CASE WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 60) END,
    'days_left', CASE WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 86400) END,
    'expires_at', v_row.expires_at,
    'owner_email', v_email_masked,
    'owner_name', v_name
  );
END; $function$;
