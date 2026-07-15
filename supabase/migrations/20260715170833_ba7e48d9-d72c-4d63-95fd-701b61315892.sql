-- Instagram DM otomasyonu tabloları

CREATE TYPE public.ig_match_type AS ENUM ('exact', 'contains', 'starts_with', 'regex');

CREATE TABLE public.ig_auto_reply_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger TEXT NOT NULL,
  match_type public.ig_match_type NOT NULL DEFAULT 'contains',
  case_sensitive BOOLEAN NOT NULL DEFAULT false,
  response TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  match_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ig_rules_active_prio ON public.ig_auto_reply_rules (active, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_auto_reply_rules TO authenticated;
GRANT ALL ON public.ig_auto_reply_rules TO service_role;

ALTER TABLE public.ig_auto_reply_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage ig rules"
  ON public.ig_auto_reply_rules
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ig_message_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ig_message_id TEXT UNIQUE,
  sender_id TEXT NOT NULL,
  sender_username TEXT,
  recipient_id TEXT,
  message_text TEXT,
  matched_rule_id UUID REFERENCES public.ig_auto_reply_rules(id) ON DELETE SET NULL,
  reply_sent BOOLEAN NOT NULL DEFAULT false,
  reply_text TEXT,
  reply_error TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ig_log_sender ON public.ig_message_log (sender_id, created_at DESC);
CREATE INDEX idx_ig_log_created ON public.ig_message_log (created_at DESC);

GRANT SELECT ON public.ig_message_log TO authenticated;
GRANT ALL ON public.ig_message_log TO service_role;

ALTER TABLE public.ig_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read ig logs"
  ON public.ig_message_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.tg_ig_rules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ig_rules_updated_at
  BEFORE UPDATE ON public.ig_auto_reply_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_ig_rules_updated_at();
