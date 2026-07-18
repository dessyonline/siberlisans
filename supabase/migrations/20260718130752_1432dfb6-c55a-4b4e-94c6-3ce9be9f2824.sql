
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old schedule if exists
DO $$ BEGIN
  PERFORM cron.unschedule('ai-video-worker');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'ai-video-worker',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--52e254a6-918f-43c4-9617-e74771d5be97.lovable.app/api/public/hooks/process-ai-videos',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_KlIK_xqx3I70NpoDZxz1Gg_YGxtU5Cx"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
