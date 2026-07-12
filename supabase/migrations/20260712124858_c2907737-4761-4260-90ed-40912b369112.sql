
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_pushed_pending
  ON public.notifications (created_at)
  WHERE pushed_at IS NULL;
