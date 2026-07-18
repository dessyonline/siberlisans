
ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill for existing done jobs: 30 days from creation
UPDATE public.ai_jobs
  SET expires_at = created_at + interval '30 days'
  WHERE kind = 'video' AND expires_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_ai_video_job(_prompt text, _duration integer, _aspect text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_tier TEXT;
  v_cost NUMERIC(10,2);
  v_bal NUMERIC(10,2);
  v_new NUMERIC(10,2);
  v_job UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _duration NOT IN (5,10) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF _aspect NOT IN ('16:9','9:16','1:1') THEN RAISE EXCEPTION 'invalid_aspect'; END IF;
  IF length(coalesce(_prompt,'')) < 3 THEN RAISE EXCEPTION 'invalid_prompt'; END IF;

  SELECT lower(coalesce(tier,'bronze')) INTO v_tier FROM public.profiles WHERE id = v_user;

  -- Tier bazlı fiyat: gold/platinum düşük, diğerleri standart
  IF v_tier IN ('gold','platinum') THEN
    v_cost := CASE _duration WHEN 5 THEN 10 WHEN 10 THEN 20 END;
  ELSE
    v_cost := CASE _duration WHEN 5 THEN 15 WHEN 10 THEN 30 END;
  END IF;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_user, 0) ON CONFLICT DO NOTHING;
  SELECT balance_try INTO v_bal FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_bal < v_cost THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_new := v_bal - v_cost;
  UPDATE public.wallets SET balance_try = v_new WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions(user_id, amount_try, balance_after, kind, note)
    VALUES (v_user, -v_cost, v_new, 'purchase', 'ai_video_job');

  INSERT INTO public.ai_jobs(user_id, kind, prompt, params, cost_try, status, expires_at)
    VALUES (v_user, 'video', _prompt,
            jsonb_build_object('duration',_duration,'aspect',_aspect,'tier',v_tier),
            v_cost, 'queued', now() + interval '30 days')
    RETURNING id INTO v_job;
  RETURN v_job;
END; $$;

-- Helper: kullanıcı tier'ına göre canlı fiyat gösterimi için
CREATE OR REPLACE FUNCTION public.ai_video_prices()
  RETURNS TABLE(duration integer, cost_try numeric)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_tier TEXT := 'bronze';
BEGIN
  IF v_user IS NOT NULL THEN
    SELECT lower(coalesce(tier,'bronze')) INTO v_tier FROM public.profiles WHERE id = v_user;
  END IF;
  IF v_tier IN ('gold','platinum') THEN
    RETURN QUERY SELECT 5, 10::numeric UNION ALL SELECT 10, 20::numeric;
  ELSE
    RETURN QUERY SELECT 5, 15::numeric UNION ALL SELECT 10, 30::numeric;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.ai_video_prices() TO authenticated, anon;
