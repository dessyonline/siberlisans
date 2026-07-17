
-- Fix consume_ai_quota to use user_points_ledger.balance_after
CREATE OR REPLACE FUNCTION public.consume_ai_quota(_tool_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_tier TEXT; v_limit INT;
  v_today DATE := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_used INT := 0; v_points INT := 0; v_new_pts INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT COALESCE(tier,'bronze'), COALESCE(total_points,0)
    INTO v_tier, v_points FROM public.profiles WHERE id = v_user;
  v_limit := CASE lower(coalesce(v_tier,'bronze'))
    WHEN 'platinum' THEN 150 WHEN 'gold' THEN 60 WHEN 'silver' THEN 25 ELSE 10 END;

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

  IF v_points < 5 THEN RAISE EXCEPTION 'quota_exhausted'; END IF;
  v_new_pts := v_points - 5;
  UPDATE public.profiles SET total_points = v_new_pts WHERE id = v_user;
  INSERT INTO public.user_points_ledger(user_id, delta, reason, balance_after)
    VALUES (v_user, -5, 'ai_tool:'||_tool_key, v_new_pts);
  UPDATE public.ai_tool_usage
    SET count = count + 1, points_spent = points_spent + 5
    WHERE user_id = v_user AND day = v_today AND tool_key = _tool_key;

  RETURN jsonb_build_object('ok',true,'source','points','points_spent',5,'remaining_points', v_new_pts);
END; $$;

-- Fix create_ai_video_job to use wallet_transactions actual schema
CREATE OR REPLACE FUNCTION public.create_ai_video_job(_prompt TEXT, _duration INT, _aspect TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_cost NUMERIC(10,2); v_bal NUMERIC(10,2); v_new NUMERIC(10,2); v_job UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _duration NOT IN (3,5,8) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF _aspect NOT IN ('16:9','9:16','1:1') THEN RAISE EXCEPTION 'invalid_aspect'; END IF;
  IF length(coalesce(_prompt,'')) < 3 THEN RAISE EXCEPTION 'invalid_prompt'; END IF;

  v_cost := CASE _duration WHEN 3 THEN 25 WHEN 5 THEN 40 WHEN 8 THEN 60 END;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_user, 0) ON CONFLICT DO NOTHING;
  SELECT balance_try INTO v_bal FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_bal < v_cost THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_new := v_bal - v_cost;
  UPDATE public.wallets SET balance_try = v_new WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions(user_id, amount_try, balance_after, kind, note)
    VALUES (v_user, -v_cost, v_new, 'purchase', 'ai_video_job');

  INSERT INTO public.ai_jobs(user_id, kind, prompt, params, cost_try, status)
    VALUES (v_user, 'video', _prompt,
            jsonb_build_object('duration',_duration,'aspect',_aspect),
            v_cost, 'queued')
    RETURNING id INTO v_job;
  RETURN v_job;
END; $$;

-- Fix admin complete/fail to use notifications.type/link and wallet columns
CREATE OR REPLACE FUNCTION public.admin_complete_ai_job(_job UUID, _url TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.ai_jobs SET status='done', result_url=_url, error=NULL WHERE id=_job;
  INSERT INTO public.notifications(user_id, type, title, body, link)
    SELECT user_id, 'ai_job', 'AI videon hazır', 'Video üretimi tamamlandı, teslim alabilirsin.', '/araclar/video'
    FROM public.ai_jobs WHERE id=_job;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_fail_ai_job(_job UUID, _reason TEXT, _refund BOOLEAN DEFAULT true)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID; v_cost NUMERIC(10,2); v_status TEXT; v_bal NUMERIC(10,2); v_new NUMERIC(10,2);
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT user_id, cost_try, status INTO v_user, v_cost, v_status FROM public.ai_jobs WHERE id=_job FOR UPDATE;
  IF v_status IN ('done','refunded') THEN RETURN; END IF;
  IF _refund AND v_cost > 0 THEN
    SELECT balance_try INTO v_bal FROM public.wallets WHERE user_id = v_user FOR UPDATE;
    v_new := COALESCE(v_bal,0) + v_cost;
    UPDATE public.wallets SET balance_try = v_new WHERE user_id = v_user;
    INSERT INTO public.wallet_transactions(user_id, amount_try, balance_after, kind, note)
      VALUES (v_user, v_cost, v_new, 'refund', 'ai_video_refund');
    UPDATE public.ai_jobs SET status='refunded', error=_reason WHERE id=_job;
  ELSE
    UPDATE public.ai_jobs SET status='failed', error=_reason WHERE id=_job;
  END IF;
  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (v_user, 'ai_job',
      CASE WHEN _refund THEN 'Video iptal — iade edildi' ELSE 'Video başarısız' END,
      _reason, '/araclar/video');
END; $$;
