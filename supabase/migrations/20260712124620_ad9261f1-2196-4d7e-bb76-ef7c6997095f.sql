
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  last_success_at TIMESTAMPTZ,
  fail_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own subs manage" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: notifications tablosuna insert olunca web push kuyruğa
-- Basit yaklaşım: push, notifications insert'inde direkt tetiklenmeyecek —
-- server fonksiyonundan sendPushToUser() ile çağrılacak (esneklik için).

-- Notification prefs: web_push kolonu ekle
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS web_push BOOLEAN NOT NULL DEFAULT TRUE;
