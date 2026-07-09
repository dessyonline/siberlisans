
-- Replay protection nonces (5 min TTL)
CREATE TABLE IF NOT EXISTS public.license_nonces (
  nonce text PRIMARY KEY,
  license_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.license_nonces TO service_role;
ALTER TABLE public.license_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only nonces" ON public.license_nonces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_license_nonces_created ON public.license_nonces (created_at);

-- Append-only event log
CREATE TABLE IF NOT EXISTS public.license_events (
  id bigserial PRIMARY KEY,
  license_key text NOT NULL,
  event text NOT NULL,
  hwid text,
  ip text,
  user_agent text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.license_events TO authenticated;
GRANT ALL ON public.license_events TO service_role;
ALTER TABLE public.license_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read license events" ON public.license_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_license_events_key_created ON public.license_events (license_key, created_at DESC);

-- Cleanup old nonces (called by activate/validate)
CREATE OR REPLACE FUNCTION public.cleanup_license_nonces()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.license_nonces WHERE created_at < now() - interval '10 minutes';
$$;

-- Admin: create a new license key (product_id + duration)
CREATE OR REPLACE FUNCTION public.admin_create_license_key(
  _product_id uuid,
  _duration_days integer DEFAULT 30,
  _key_value text DEFAULT NULL,
  _email text DEFAULT NULL
)
RETURNS TABLE(id uuid, key_value text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_id uuid;
  v_exp timestamptz;
BEGIN
  IF _key_value IS NULL OR length(_key_value) = 0 THEN
    v_key := upper(
      substr(md5(random()::text || clock_timestamp()::text), 1, 5) || '-' ||
      substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
      substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
      substr(md5(random()::text || clock_timestamp()::text), 1, 5)
    );
  ELSE
    v_key := upper(_key_value);
  END IF;
  v_exp := CASE WHEN _duration_days IS NULL OR _duration_days <= 0
                THEN NULL ELSE now() + (_duration_days || ' days')::interval END;
  INSERT INTO public.license_keys (product_id, key_value, status, duration_days, expires_at)
  VALUES (_product_id, v_key, 'available', _duration_days, v_exp)
  RETURNING license_keys.id INTO v_id;
  RETURN QUERY SELECT v_id, v_key, v_exp;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_license_key(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_license_key(uuid, integer, text, text) TO service_role;

-- Admin: revoke by key value
CREATE OR REPLACE FUNCTION public.admin_revoke_license_key(_key_value text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.license_keys
     SET revoked = true
   WHERE upper(key_value) = upper(_key_value);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_revoke_license_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_license_key(text) TO service_role;
