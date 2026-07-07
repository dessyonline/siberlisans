
CREATE OR REPLACE FUNCTION public.activate_license(_key TEXT, _hwid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.license_keys%ROWTYPE;
  v_days INTEGER;
  v_key TEXT;
  v_hwid TEXT;
BEGIN
  v_key := upper(btrim(coalesce(_key,'')));
  v_hwid := btrim(coalesce(_hwid,''));
  IF length(v_key) < 4 OR length(v_hwid) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geçersiz istek.');
  END IF;

  SELECT * INTO v_row FROM public.license_keys WHERE upper(key_value) = v_key FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lisans anahtarı bulunamadı.');
  END IF;
  IF v_row.revoked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bu lisans iptal edilmiş.');
  END IF;
  IF v_row.hwid IS NOT NULL AND v_row.hwid <> v_hwid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bu lisans anahtarı zaten başka bir cihazda kullanılıyor.');
  END IF;

  IF v_row.duration_days IS NULL THEN
    SELECT default_license_days INTO v_days FROM public.products WHERE id = v_row.product_id;
  ELSE
    v_days := v_row.duration_days;
  END IF;

  IF v_row.hwid IS NULL THEN
    UPDATE public.license_keys
      SET hwid = v_hwid,
          activated_at = COALESCE(activated_at, now()),
          expires_at = CASE
            WHEN expires_at IS NOT NULL THEN expires_at
            WHEN v_days IS NOT NULL THEN now() + (v_days || ' days')::interval
            ELSE NULL
          END,
          duration_days = COALESCE(duration_days, v_days),
          last_validated_at = now()
      WHERE id = v_row.id
      RETURNING * INTO v_row;
  ELSE
    UPDATE public.license_keys SET last_validated_at = now() WHERE id = v_row.id
      RETURNING * INTO v_row;
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lisans süreniz doldu.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'days_left', CASE WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 86400) END,
    'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_license(_key TEXT, _hwid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.license_keys%ROWTYPE;
  v_key TEXT;
  v_hwid TEXT;
BEGIN
  v_key := upper(btrim(coalesce(_key,'')));
  v_hwid := btrim(coalesce(_hwid,''));
  IF v_key = '' OR v_hwid = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Geçersiz istek.');
  END IF;

  SELECT * INTO v_row FROM public.license_keys WHERE upper(key_value) = v_key;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans bulunamadı.');
  END IF;
  IF v_row.revoked THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans iptal edildi.');
  END IF;
  IF v_row.hwid IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans henüz etkinleştirilmemiş.');
  END IF;
  IF v_row.hwid <> v_hwid THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Bu lisans başka bir cihaza kilitli.');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans süreniz doldu.');
  END IF;

  UPDATE public.license_keys SET last_validated_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'valid', true,
    'days_left', CASE WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 86400) END,
    'expires_at', v_row.expires_at
  );
END;
$$;

UPDATE public.license_keys
  SET hwid = NULL, activated_at = NULL, expires_at = NULL, last_validated_at = NULL
  WHERE key_value = 'LVBL-D79C-4TWW-MS3Q-WKGA';
