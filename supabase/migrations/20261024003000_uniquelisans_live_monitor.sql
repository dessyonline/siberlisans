-- Uniquelisans kataloğunu otomatik güncel tutar:
--   * stok/fiyat: 5 dakikada bir
--   * yeni ürün/tam katalog: 30 dakikada bir
--
-- Cron çağrısı yalnızca Vault'taki server secret ile yapılır. Publishable key
-- bilerek kullanılmaz; endpoint tarafı CRON_SECRET veya service-role secret ister.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_auto_publish boolean NOT NULL DEFAULT false;

-- Halihazırda satışta olan UniQLisans ürünleri otomatik stok yönetimine dahil
-- edilir. Pasif ürünler elle incelenene kadar kendiliğinden açılmaz.
UPDATE public.products
   SET supplier_auto_publish = true
 WHERE source = 'uniquelisans' AND active = true;

CREATE INDEX IF NOT EXISTS idx_products_supplier_auto_publish
  ON public.products(source, supplier_auto_publish)
  WHERE source = 'uniquelisans';

CREATE TABLE IF NOT EXISTS public.uniquelisans_sync_state (
  sync_key text PRIMARY KEY,
  lock_until timestamptz,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'success', 'failed')),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.uniquelisans_sync_state(sync_key)
VALUES ('stock'), ('catalog')
ON CONFLICT (sync_key) DO NOTHING;

GRANT ALL ON public.uniquelisans_sync_state TO service_role;
ALTER TABLE public.uniquelisans_sync_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('uniquelisans-stock-sync');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('uniquelisans-catalog-sync');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'uniquelisans-stock-sync',
    '*/5 * * * *',
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
          url := 'https://siberlisans.com/api/public/hooks/uniquelisans-stock',
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

  PERFORM cron.schedule(
    'uniquelisans-catalog-sync',
    '*/30 * * * *',
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
          url := 'https://siberlisans.com/api/public/hooks/uniquelisans-catalog',
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
  -- pg_cron/Vault her ortamda aktif olmayabilir; migration deploy'u yine de
  -- başarılı kalsın. Zamanlayıcı sonradan Supabase üzerinden etkinleştirilebilir.
  NULL;
END $$;
