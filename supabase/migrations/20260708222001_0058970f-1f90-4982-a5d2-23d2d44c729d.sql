ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_ip text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_session_ip(_ip text)
RETURNS TABLE(ip_changed boolean, previous_ip text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev text;
BEGIN
  IF v_uid IS NULL THEN
    ip_changed := false; previous_ip := NULL; RETURN NEXT; RETURN;
  END IF;
  SELECT last_seen_ip INTO v_prev FROM public.profiles WHERE id = v_uid;
  UPDATE public.profiles
    SET last_seen_ip = COALESCE(_ip, last_seen_ip),
        last_seen_at = now()
    WHERE id = v_uid;
  ip_changed := (v_prev IS NOT NULL AND _ip IS NOT NULL AND v_prev <> _ip);
  previous_ip := v_prev;
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.touch_session_ip(text) TO authenticated;