-- Aynı tarayıcı isteği ağ nedeniyle tekrarlandığında video iki kez ücretlenmesin.
ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_user_idempotency_idx
  ON public.ai_jobs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
