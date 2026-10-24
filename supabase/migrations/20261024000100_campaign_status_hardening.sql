-- Kampanya worker'ının kullandığı 'sending' durumunu her ortamda güvenceye al.
-- Önceki migration uygulanmamış veya eski şema geri yüklenmiş olsa bile idempotenttir.
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS idx_campaigns_sending
  ON public.campaigns (updated_at)
  WHERE status = 'sending';
