
-- 1) ai_tool_usage
CREATE TABLE public.ai_tool_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Istanbul')::date,
  count INTEGER NOT NULL DEFAULT 0,
  points_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, day, tool_key)
);
GRANT SELECT ON public.ai_tool_usage TO authenticated;
GRANT ALL ON public.ai_tool_usage TO service_role;
ALTER TABLE public.ai_tool_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage read" ON public.ai_tool_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- 2) ai_jobs
CREATE TABLE public.ai_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,               -- 'video'
  prompt TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_try NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|processing|done|failed|refunded
  result_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_jobs TO authenticated;
GRANT ALL ON public.ai_jobs TO service_role;
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs read" ON public.ai_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE INDEX ai_jobs_user_idx ON public.ai_jobs(user_id, created_at DESC);
CREATE INDEX ai_jobs_status_idx ON public.ai_jobs(status, created_at);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_ai_jobs_updated BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_tool_usage_updated BEFORE UPDATE ON public.ai_tool_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) consume_ai_quota
CREATE OR REPLACE FUNCTION public.consume_ai_quota(_tool_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_tier TEXT;
  v_limit INT;
  v_today DATE := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_used INT := 0;
  v_points INT := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT COALESCE(tier,'bronze'), COALESCE(total_points,0)
    INTO v_tier, v_points FROM public.profiles WHERE id = v_user;

  v_limit := CASE lower(coalesce(v_tier,'bronze'))
    WHEN 'platinum' THEN 150
    WHEN 'gold'     THEN 60
    WHEN 'silver'   THEN 25
    ELSE 10
  END;

  INSERT INTO public.ai_tool_usage(user_id, tool_key, day, count)
  VALUES (v_user, _tool_key, v_today, 0)
  ON CONFLICT (user_id, day, tool_key) DO NOTHING;

  SELECT count INTO v_used FROM public.ai_tool_usage
    WHERE user_id = v_user AND day = v_today AND tool_key = _tool_key FOR UPDATE;

  IF v_used < v_limit THEN
    UPDATE public.ai_tool_usage SET count = count + 1
      WHERE user_id = v_user AND day = v_today AND tool_key = _tool_key;
    RETURN jsonb_build_object('ok',true,'source','quota','remaining', v_limit - v_used - 1, 'limit', v_limit);
  END IF;

  -- Kota bitti — 5 puan harca
  IF v_points < 5 THEN
    RAISE EXCEPTION 'quota_exhausted';
  END IF;

  UPDATE public.profiles SET total_points = total_points - 5 WHERE id = v_user;
  INSERT INTO public.user_points_ledger(user_id, delta, reason)
    VALUES (v_user, -5, 'ai_tool:'||_tool_key);
  UPDATE public.ai_tool_usage
    SET count = count + 1, points_spent = points_spent + 5
    WHERE user_id = v_user AND day = v_today AND tool_key = _tool_key;

  RETURN jsonb_build_object('ok',true,'source','points','points_spent',5,'remaining_points', v_points - 5);
END; $$;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(TEXT) TO authenticated;

-- 4) create_ai_video_job (cüzdandan düş)
CREATE OR REPLACE FUNCTION public.create_ai_video_job(_prompt TEXT, _duration INT, _aspect TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_cost NUMERIC(10,2);
  v_bal NUMERIC(10,2);
  v_job UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _duration NOT IN (3,5,8) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF _aspect NOT IN ('16:9','9:16','1:1') THEN RAISE EXCEPTION 'invalid_aspect'; END IF;
  IF length(coalesce(_prompt,'')) < 3 THEN RAISE EXCEPTION 'invalid_prompt'; END IF;

  v_cost := CASE _duration WHEN 3 THEN 25 WHEN 5 THEN 40 WHEN 8 THEN 60 END;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_user, 0) ON CONFLICT DO NOTHING;
  SELECT balance_try INTO v_bal FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_bal < v_cost THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE public.wallets SET balance_try = balance_try - v_cost WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions(user_id, delta, reason)
    VALUES (v_user, -v_cost, 'ai_video_job');

  INSERT INTO public.ai_jobs(user_id, kind, prompt, params, cost_try, status)
    VALUES (v_user, 'video', _prompt,
            jsonb_build_object('duration',_duration,'aspect',_aspect),
            v_cost, 'queued')
    RETURNING id INTO v_job;
  RETURN v_job;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_ai_video_job(TEXT,INT,TEXT) TO authenticated;

-- 5) admin complete / fail
CREATE OR REPLACE FUNCTION public.admin_complete_ai_job(_job UUID, _url TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.ai_jobs SET status='done', result_url=_url, error=NULL WHERE id=_job;
  INSERT INTO public.notifications(user_id, kind, title, body, meta)
    SELECT user_id, 'ai_job', 'Video hazır', 'AI videon hazır — teslim alabilirsin.', jsonb_build_object('job_id',_job,'url',_url)
    FROM public.ai_jobs WHERE id=_job;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_complete_ai_job(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_fail_ai_job(_job UUID, _reason TEXT, _refund BOOLEAN DEFAULT true)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID; v_cost NUMERIC(10,2); v_status TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT user_id, cost_try, status INTO v_user, v_cost, v_status FROM public.ai_jobs WHERE id=_job FOR UPDATE;
  IF v_status IN ('done','refunded') THEN RETURN; END IF;
  IF _refund AND v_cost > 0 THEN
    UPDATE public.wallets SET balance_try = balance_try + v_cost WHERE user_id = v_user;
    INSERT INTO public.wallet_transactions(user_id, delta, reason)
      VALUES (v_user, v_cost, 'ai_video_refund');
    UPDATE public.ai_jobs SET status='refunded', error=_reason WHERE id=_job;
  ELSE
    UPDATE public.ai_jobs SET status='failed', error=_reason WHERE id=_job;
  END IF;
  INSERT INTO public.notifications(user_id, kind, title, body, meta)
    VALUES (v_user, 'ai_job',
      CASE WHEN _refund THEN 'Video iptal — iade edildi' ELSE 'Video başarısız' END,
      _reason, jsonb_build_object('job_id',_job));
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_fail_ai_job(UUID,TEXT,BOOLEAN) TO authenticated;
