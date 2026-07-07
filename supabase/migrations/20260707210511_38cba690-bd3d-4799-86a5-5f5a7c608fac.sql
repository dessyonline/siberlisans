
ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Backfill from existing duration_days
UPDATE public.license_keys
  SET duration_minutes = duration_days * 1440
  WHERE duration_minutes IS NULL AND duration_days IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activate_license(_key TEXT, _hwid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.license_keys%ROWTYPE;
  v_minutes INTEGER;
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

  v_minutes := COALESCE(
    v_row.duration_minutes,
    v_row.duration_days * 1440,
    (SELECT default_license_days * 1440 FROM public.products WHERE id = v_row.product_id)
  );

  IF v_row.hwid IS NULL THEN
    UPDATE public.license_keys
      SET hwid = v_hwid,
          activated_at = COALESCE(activated_at, now()),
          expires_at = CASE
            WHEN expires_at IS NOT NULL THEN expires_at
            WHEN v_minutes IS NOT NULL THEN now() + (v_minutes || ' minutes')::interval
            ELSE NULL
          END,
          duration_minutes = COALESCE(duration_minutes, v_minutes),
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
    'minutes_left', CASE WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 60) END,
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
    'minutes_left', CASE WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 60) END,
    'days_left', CASE WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 86400) END,
    'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_license(
  _id UUID,
  _action TEXT,
  _value_int INTEGER DEFAULT NULL,
  _value_ts TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.license_keys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.license_keys%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  IF _action = 'revoke' THEN
    UPDATE public.license_keys SET revoked = true WHERE id = _id RETURNING * INTO v_row;
  ELSIF _action = 'unrevoke' THEN
    UPDATE public.license_keys SET revoked = false WHERE id = _id RETURNING * INTO v_row;
  ELSIF _action = 'reset_hwid' THEN
    UPDATE public.license_keys
      SET hwid = NULL, activated_at = NULL, last_validated_at = NULL, expires_at = NULL
      WHERE id = _id RETURNING * INTO v_row;
  ELSIF _action = 'set_duration' THEN
    -- backward compat: days
    UPDATE public.license_keys
      SET duration_days = _value_int,
          duration_minutes = CASE WHEN _value_int IS NULL THEN NULL ELSE _value_int * 1440 END,
          expires_at = CASE
            WHEN activated_at IS NOT NULL AND _value_int IS NOT NULL
              THEN activated_at + (_value_int || ' days')::interval
            WHEN _value_int IS NULL THEN NULL
            ELSE expires_at
          END
      WHERE id = _id RETURNING * INTO v_row;
  ELSIF _action = 'set_duration_minutes' THEN
    UPDATE public.license_keys
      SET duration_minutes = _value_int,
          duration_days = CASE WHEN _value_int IS NULL THEN NULL ELSE _value_int / 1440 END,
          expires_at = CASE
            WHEN activated_at IS NOT NULL AND _value_int IS NOT NULL
              THEN activated_at + (_value_int || ' minutes')::interval
            WHEN _value_int IS NULL THEN NULL
            ELSE expires_at
          END
      WHERE id = _id RETURNING * INTO v_row;
  ELSIF _action = 'set_expires' THEN
    UPDATE public.license_keys SET expires_at = _value_ts WHERE id = _id RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'Bilinmeyen işlem: %', _action;
  END IF;

  RETURN v_row;
END;
$$;
