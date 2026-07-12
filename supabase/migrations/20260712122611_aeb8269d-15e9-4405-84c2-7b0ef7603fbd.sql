-- Onboarding & digest columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Weekly digest log
CREATE TABLE IF NOT EXISTS public.weekly_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  items_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB
);

GRANT SELECT ON public.weekly_digest_log TO authenticated;
GRANT ALL ON public.weekly_digest_log TO service_role;

ALTER TABLE public.weekly_digest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_read_own_digest_log"
  ON public.weekly_digest_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_weekly_digest_log_user_sent
  ON public.weekly_digest_log(user_id, sent_at DESC);

-- RPC: mark onboarding complete
CREATE OR REPLACE FUNCTION public.mark_onboarded()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET onboarded_at = COALESCE(onboarded_at, now())
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_onboarded() TO authenticated;