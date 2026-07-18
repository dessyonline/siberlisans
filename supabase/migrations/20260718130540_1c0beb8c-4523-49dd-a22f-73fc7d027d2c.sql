
DROP FUNCTION IF EXISTS public.ai_video_prices();
DROP FUNCTION IF EXISTS public.create_ai_video_job(text, int, text);

ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'fal',
  ADD COLUMN IF NOT EXISTS provider_request_id text,
  ADD COLUMN IF NOT EXISTS provider_model text;

CREATE INDEX IF NOT EXISTS ai_jobs_provider_req_idx ON public.ai_jobs(provider_request_id) WHERE provider_request_id IS NOT NULL;

CREATE FUNCTION public.ai_video_prices()
RETURNS TABLE(quality text, duration int, cost_try numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT COALESCE(lower(tier::text),'bronze') AS tier FROM profiles WHERE id = auth.uid()),
       disc AS (SELECT CASE WHEN tier IN ('gold','platinum') THEN 0.80 ELSE 1.0 END AS m FROM me)
  SELECT q.quality, q.duration, ROUND(q.base * COALESCE((SELECT m FROM disc), 1.0), 0)::numeric
  FROM (VALUES
    ('fast'::text,5,10::numeric),('fast',10,20),
    ('hd',5,25),('hd',10,50),
    ('cinematic',5,50),('cinematic',10,100)
  ) AS q(quality,duration,base);
$$;

CREATE FUNCTION public.create_ai_video_job(
  _prompt text, _duration int, _aspect text, _quality text DEFAULT 'fast'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_cost numeric; v_balance numeric; v_job uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _duration NOT IN (5,10) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF _aspect NOT IN ('16:9','9:16','1:1') THEN RAISE EXCEPTION 'invalid_aspect'; END IF;
  IF _quality NOT IN ('fast','hd','cinematic') THEN RAISE EXCEPTION 'invalid_quality'; END IF;

  SELECT cost_try INTO v_cost FROM ai_video_prices() WHERE quality=_quality AND duration=_duration;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'price_not_found'; END IF;

  SELECT balance_try INTO v_balance FROM wallets WHERE user_id=v_uid FOR UPDATE;
  IF COALESCE(v_balance,0) < v_cost THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE wallets SET balance_try = balance_try - v_cost WHERE user_id=v_uid;
  INSERT INTO wallet_transactions(user_id,direction,amount_try,reason,meta)
  VALUES (v_uid,'debit',v_cost,'ai_video', jsonb_build_object('quality',_quality,'duration',_duration));

  INSERT INTO ai_jobs(user_id,kind,prompt,params,cost_try,status,expires_at,provider)
  VALUES (v_uid,'video',_prompt,
          jsonb_build_object('duration',_duration,'aspect',_aspect,'quality',_quality),
          v_cost,'queued', now()+interval '30 days','fal')
  RETURNING id INTO v_job;
  RETURN v_job;
END $$;

GRANT EXECUTE ON FUNCTION public.ai_video_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_video_job(text,int,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.worker_claim_ai_jobs(_limit int DEFAULT 5)
RETURNS SETOF public.ai_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ai_jobs SET status='processing', updated_at=now()
   WHERE id IN (
     SELECT id FROM public.ai_jobs WHERE status='queued' AND kind='video'
      ORDER BY created_at ASC LIMIT _limit FOR UPDATE SKIP LOCKED)
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.worker_pending_ai_jobs(_limit int DEFAULT 20)
RETURNS SETOF public.ai_jobs LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.ai_jobs
   WHERE status='processing' AND provider_request_id IS NOT NULL
   ORDER BY updated_at ASC LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.worker_set_provider_request(_job uuid, _req_id text, _model text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ai_jobs SET provider_request_id=_req_id, provider_model=_model, updated_at=now() WHERE id=_job;
$$;

CREATE OR REPLACE FUNCTION public.worker_complete_ai_job(_job uuid, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ai_jobs SET status='done', result_url=_url, updated_at=now()
   WHERE id=_job AND status IN ('queued','processing');
  INSERT INTO notifications(user_id,type,title,body,meta)
  SELECT user_id,'ai_video_ready','Videon hazır','AI videon tamamlandı — indirebilirsin.',
         jsonb_build_object('job',_job,'url',_url)
    FROM public.ai_jobs WHERE id=_job;
END $$;

CREATE OR REPLACE FUNCTION public.worker_fail_ai_job(_job uuid, _reason text, _refund boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_cost numeric;
BEGIN
  SELECT user_id, cost_try INTO v_user, v_cost FROM public.ai_jobs WHERE id=_job;
  IF v_user IS NULL THEN RETURN; END IF;
  IF _refund THEN
    UPDATE wallets SET balance_try = balance_try + v_cost WHERE user_id=v_user;
    INSERT INTO wallet_transactions(user_id,direction,amount_try,reason,meta)
    VALUES (v_user,'credit',v_cost,'ai_video_refund', jsonb_build_object('job',_job));
    UPDATE public.ai_jobs SET status='refunded', error=_reason, updated_at=now() WHERE id=_job;
  ELSE
    UPDATE public.ai_jobs SET status='failed', error=_reason, updated_at=now() WHERE id=_job;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.worker_claim_ai_jobs(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.worker_pending_ai_jobs(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.worker_set_provider_request(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.worker_complete_ai_job(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.worker_fail_ai_job(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_claim_ai_jobs(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.worker_pending_ai_jobs(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.worker_set_provider_request(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.worker_complete_ai_job(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.worker_fail_ai_job(uuid,text,boolean) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ai_videos_owner_read') THEN
    CREATE POLICY "ai_videos_owner_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id='ai-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ai_videos_service_all') THEN
    CREATE POLICY "ai_videos_service_all" ON storage.objects
      FOR ALL TO service_role USING (bucket_id='ai-videos') WITH CHECK (bucket_id='ai-videos');
  END IF;
END $$;
