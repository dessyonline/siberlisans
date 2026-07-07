
ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS hwid TEXT,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_license_keys_key_value ON public.license_keys(key_value);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_license_days INTEGER;

-- Activate: first-time HWID bind
CREATE OR REPLACE FUNCTION public.activate_license(_key TEXT, _hwid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.license_keys%ROWTYPE;
  v_days INTEGER;
BEGIN
  IF _key IS NULL OR _hwid IS NULL OR length(_key) < 4 OR length(_hwid) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geçersiz istek.');
  END IF;

  SELECT * INTO v_row FROM public.license_keys WHERE key_value = _key FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lisans anahtarı bulunamadı.');
  END IF;

  IF v_row.revoked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bu lisans iptal edilmiş.');
  END IF;

  -- If already bound to another HWID, reject
  IF v_row.hwid IS NOT NULL AND v_row.hwid <> _hwid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bu lisans anahtarı zaten başka bir cihazda kullanılıyor.');
  END IF;

  -- Determine duration
  IF v_row.duration_days IS NULL THEN
    SELECT default_license_days INTO v_days FROM public.products WHERE id = v_row.product_id;
  ELSE
    v_days := v_row.duration_days;
  END IF;

  -- First-time activation: set hwid, activated_at, expires_at
  IF v_row.hwid IS NULL THEN
    UPDATE public.license_keys
      SET hwid = _hwid,
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
    'days_left', CASE
      WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 86400)
    END,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- Validate: called periodically
CREATE OR REPLACE FUNCTION public.validate_license(_key TEXT, _hwid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.license_keys%ROWTYPE;
BEGIN
  IF _key IS NULL OR _hwid IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Geçersiz istek.');
  END IF;

  SELECT * INTO v_row FROM public.license_keys WHERE key_value = _key;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans bulunamadı.');
  END IF;
  IF v_row.revoked THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans iptal edildi.');
  END IF;
  IF v_row.hwid IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans henüz etkinleştirilmemiş.');
  END IF;
  IF v_row.hwid <> _hwid THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Bu lisans başka bir cihaza kilitli.');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Lisans süreniz doldu.');
  END IF;

  UPDATE public.license_keys SET last_validated_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'valid', true,
    'days_left', CASE
      WHEN v_row.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_row.expires_at - now()))::int / 86400)
    END,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- Admin edit: revoke, reset HWID, set duration/expires
CREATE OR REPLACE FUNCTION public.admin_set_license(
  _id UUID,
  _action TEXT,           -- 'revoke' | 'unrevoke' | 'reset_hwid' | 'set_duration' | 'set_expires'
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
      SET hwid = NULL, activated_at = NULL, last_validated_at = NULL
      WHERE id = _id RETURNING * INTO v_row;
  ELSIF _action = 'set_duration' THEN
    UPDATE public.license_keys
      SET duration_days = _value_int,
          expires_at = CASE
            WHEN activated_at IS NOT NULL AND _value_int IS NOT NULL
              THEN activated_at + (_value_int || ' days')::interval
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

GRANT EXECUTE ON FUNCTION public.activate_license(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_license(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_license(UUID, TEXT, INTEGER, TIMESTAMPTZ) TO authenticated;
