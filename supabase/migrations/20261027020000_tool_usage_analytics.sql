-- Araç kullanım analitiği: ücretsiz araçlar, AI kalite ölçümü ve kullanıcı geri bildirimi.
CREATE TABLE IF NOT EXISTS public.tool_usage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL,
  tool_kind TEXT NOT NULL DEFAULT 'free' CHECK (tool_kind IN ('free', 'ai')),
  event_action TEXT NOT NULL DEFAULT 'viewed' CHECK (event_action IN ('viewed', 'completed', 'failed')),
  duration_ms INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_usage_events_user_idx
  ON public.tool_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_usage_events_tool_idx
  ON public.tool_usage_events(tool_key, created_at DESC);

GRANT SELECT ON public.tool_usage_events TO authenticated;
GRANT ALL ON public.tool_usage_events TO service_role;
ALTER TABLE public.tool_usage_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tool_usage_events' AND policyname = 'own tool usage read'
  ) THEN
    CREATE POLICY "own tool usage read" ON public.tool_usage_events
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tool_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tool_key)
);

CREATE INDEX IF NOT EXISTS tool_feedback_tool_idx
  ON public.tool_feedback(tool_key, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.tool_feedback TO authenticated;
GRANT ALL ON public.tool_feedback TO service_role;
ALTER TABLE public.tool_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tool_feedback' AND policyname = 'own tool feedback read'
  ) THEN
    CREATE POLICY "own tool feedback read" ON public.tool_feedback
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tool_feedback' AND policyname = 'own tool feedback write'
  ) THEN
    CREATE POLICY "own tool feedback write" ON public.tool_feedback
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tool_feedback' AND policyname = 'own tool feedback update'
  ) THEN
    CREATE POLICY "own tool feedback update" ON public.tool_feedback
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_tool_feedback_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tool_feedback_updated ON public.tool_feedback;
CREATE TRIGGER trg_tool_feedback_updated
  BEFORE UPDATE ON public.tool_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_tool_feedback_updated_at();
