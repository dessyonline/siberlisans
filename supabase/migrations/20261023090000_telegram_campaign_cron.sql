-- Zamanlanmış Telegram kampanyalarını dakikada bir işler.
--
-- Cron çağrısı, Vault'taki campaign_cron_secret varsa çalışır. Bu sayede
-- migration sonrasında secret eklenene kadar dış endpoint'e yetkisiz istek
-- gönderilmez. campaign_cron_secret yoksa mevcut email altyapısının service
-- role secret'ı fallback olarak kullanılabilir.
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed'));

DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('telegram-campaign-tick');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'telegram-campaign-tick',
    '* * * * *',
    $job$
      SELECT CASE
        WHEN COALESCE((
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name IN ('campaign_cron_secret', 'email_queue_service_role_key')
          ORDER BY CASE WHEN name = 'campaign_cron_secret' THEN 0 ELSE 1 END
          LIMIT 1
        ), '') <> ''
        THEN net.http_post(
          url := 'https://siberlisans.com/api/public/hooks/campaign-tick',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name IN ('campaign_cron_secret', 'email_queue_service_role_key')
              ORDER BY CASE WHEN name = 'campaign_cron_secret' THEN 0 ELSE 1 END
              LIMIT 1
            )
          ),
          body := '{}'::jsonb
        )
        ELSE NULL
      END;
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron/Vault may not be enabled in every environment. The app remains
  -- deployable; scheduled delivery can be enabled later from Supabase.
  NULL;
END $$;
