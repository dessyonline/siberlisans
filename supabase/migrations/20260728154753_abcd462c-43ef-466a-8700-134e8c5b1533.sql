select cron.schedule(
  'catalog-webhooks-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--52e254a6-918f-43c4-9617-e74771d5be97.lovable.app/api/public/hooks/catalog-webhooks',
    headers := jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_KlIK_xqx3I70NpoDZxz1Gg_YGxtU5Cx'),
    body := '{}'::jsonb
  );
  $$
);