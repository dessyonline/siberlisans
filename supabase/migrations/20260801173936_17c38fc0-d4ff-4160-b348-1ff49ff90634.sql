CREATE TABLE IF NOT EXISTS public.user_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  label text,
  last_ip text,
  trusted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

GRANT SELECT, DELETE ON public.user_trusted_devices TO authenticated;
GRANT ALL ON public.user_trusted_devices TO service_role;

ALTER TABLE public.user_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own devices select" ON public.user_trusted_devices
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own devices delete" ON public.user_trusted_devices
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Maksimum 2 güvenilir cihaz: yenisi eklenirken en eskisi düşer
CREATE OR REPLACE FUNCTION public.trust_current_device(_device_id text, _ip text DEFAULT NULL, _label text DEFAULT NULL, _days integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _device_id IS NULL OR length(_device_id) < 8 THEN RETURN; END IF;

  INSERT INTO public.user_trusted_devices (user_id, device_id, label, last_ip, trusted_until, last_seen_at)
  VALUES (v_uid, _device_id, _label, _ip, now() + make_interval(days => GREATEST(_days, 1)), now())
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET label = COALESCE(EXCLUDED.label, public.user_trusted_devices.label),
        last_ip = COALESCE(EXCLUDED.last_ip, public.user_trusted_devices.last_ip),
        trusted_until = EXCLUDED.trusted_until,
        last_seen_at = now();

  DELETE FROM public.user_trusted_devices d
  WHERE d.user_id = v_uid
    AND d.id NOT IN (
      SELECT id FROM public.user_trusted_devices
      WHERE user_id = v_uid
      ORDER BY last_seen_at DESC
      LIMIT 2
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.trust_current_device(text, text, text, integer) TO authenticated;

-- Cihaz farkındalıklı oturum kontrolü
CREATE OR REPLACE FUNCTION public.touch_session_device(_device_id text, _ip text)
RETURNS TABLE(ip_changed boolean, previous_ip text, device_known boolean, device_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev text;
  v_known boolean := false;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    ip_changed := false; previous_ip := NULL; device_known := false; device_count := 0;
    RETURN NEXT; RETURN;
  END IF;

  SELECT last_seen_ip INTO v_prev FROM public.profiles WHERE id = v_uid;

  SELECT count(*) INTO v_count FROM public.user_trusted_devices WHERE user_id = v_uid;

  IF _device_id IS NOT NULL THEN
    SELECT true INTO v_known
    FROM public.user_trusted_devices
    WHERE user_id = v_uid
      AND device_id = _device_id
      AND (trusted_until IS NULL OR trusted_until > now())
    LIMIT 1;

    UPDATE public.user_trusted_devices
      SET last_seen_at = now(), last_ip = COALESCE(_ip, last_ip)
      WHERE user_id = v_uid AND device_id = _device_id;
  END IF;

  UPDATE public.profiles
    SET last_seen_ip = COALESCE(_ip, last_seen_ip),
        last_seen_at = now()
    WHERE id = v_uid;

  ip_changed := (v_prev IS NOT NULL AND _ip IS NOT NULL AND v_prev <> _ip);
  previous_ip := v_prev;
  device_known := COALESCE(v_known, false);
  device_count := v_count;
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.touch_session_device(text, text) TO authenticated;