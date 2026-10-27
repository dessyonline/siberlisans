-- UniQLisans'ta pending kalan tedarikçi siparişlerini otomatik teslimata çevirir.
-- Secret değeri Vault'tan okunur; kaynak koda veya cron SQL çıktısına yazılmaz.

DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('uniquelisans-order-sync');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'uniquelisans-order-sync',
    '*/2 * * * *',
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
          url := 'https://siberlisans.com/api/public/hooks/sync-uniquelisans',
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
  -- pg_cron/Vault olmayan ortamlarda deploy kesilmesin.
  NULL;
END $$;
