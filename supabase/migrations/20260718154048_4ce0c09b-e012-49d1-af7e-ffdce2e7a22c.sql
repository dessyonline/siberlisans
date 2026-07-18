
CREATE OR REPLACE FUNCTION public.create_ai_video_job(_prompt text, _duration integer, _aspect text, _quality text DEFAULT 'fast'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_cost numeric; v_balance numeric;
  v_sub public.ai_subscriptions; v_from_sub numeric := 0; v_from_wallet numeric := 0; v_job uuid;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _duration NOT IN (5,10) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF _aspect NOT IN ('16:9','9:16','1:1') THEN RAISE EXCEPTION 'invalid_aspect'; END IF;
  IF _quality NOT IN ('fast','hd','cinematic') THEN RAISE EXCEPTION 'invalid_quality'; END IF;
  SELECT cost_try INTO v_cost FROM ai_video_prices() WHERE quality=_quality AND duration=_duration;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'price_not_found'; END IF;

  SELECT * INTO v_sub FROM public.ai_subscriptions
    WHERE user_id=v_uid AND status='active' AND expires_at > now()
    ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
  IF v_sub.id IS NOT NULL AND v_sub.credits_remaining > 0 THEN
    v_from_sub := LEAST(v_cost, v_sub.credits_remaining);
    UPDATE public.ai_subscriptions SET credits_remaining = credits_remaining - v_from_sub WHERE id = v_sub.id;
  END IF;
  v_from_wallet := v_cost - v_from_sub;
  IF v_from_wallet > 0 THEN
    SELECT balance_try INTO v_balance FROM wallets WHERE user_id=v_uid FOR UPDATE;
    IF COALESCE(v_balance,0) < v_from_wallet THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
    UPDATE wallets SET balance_try = balance_try - v_from_wallet WHERE user_id=v_uid
      RETURNING balance_try INTO v_new_balance;
    INSERT INTO wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (v_uid, 'purchase', -v_from_wallet, v_new_balance,
            'ai_video ' || _quality || ' ' || _duration || 's (sub:' || v_from_sub || ')');
  END IF;
  INSERT INTO ai_jobs(user_id,kind,prompt,params,cost_try,status,expires_at,provider)
  VALUES (v_uid,'video',_prompt,
          jsonb_build_object('duration',_duration,'aspect',_aspect,'quality',_quality,'from_sub',v_from_sub,'from_wallet',v_from_wallet),
          v_cost,'queued', now()+interval '30 days','fal')
  RETURNING id INTO v_job;
  RETURN v_job;
END $function$;

CREATE OR REPLACE FUNCTION public.purchase_ai_subscription(_plan_slug text, _billing text DEFAULT 'monthly'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_plan public.ai_subscription_plans;
  v_price numeric; v_credits int; v_days int; v_balance numeric; v_id uuid; v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _billing NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'invalid_billing'; END IF;
  SELECT * INTO v_plan FROM public.ai_subscription_plans WHERE slug=_plan_slug AND is_active=true;
  IF v_plan.slug IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF _billing='yearly' THEN
    v_price := COALESCE(v_plan.yearly_price_try, v_plan.price_try*12);
    v_credits := COALESCE(v_plan.yearly_credits, v_plan.credits*12);
    v_days := 365;
  ELSE
    v_price := v_plan.price_try; v_credits := v_plan.credits; v_days := 30;
  END IF;
  SELECT balance_try INTO v_balance FROM wallets WHERE user_id=v_uid FOR UPDATE;
  IF COALESCE(v_balance,0) < v_price THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE wallets SET balance_try = balance_try - v_price WHERE user_id=v_uid
    RETURNING balance_try INTO v_new_balance;
  INSERT INTO wallet_transactions(user_id, kind, amount_try, balance_after, note)
    VALUES (v_uid, 'purchase', -v_price, v_new_balance,
            'ai_subscription ' || _plan_slug || ' (' || _billing || ', ' || v_credits || ' credits)');
  UPDATE public.ai_subscriptions SET status='expired' WHERE user_id=v_uid AND status='active';
  INSERT INTO public.ai_subscriptions(user_id,plan_slug,billing,credits_total,credits_remaining,price_paid,expires_at)
  VALUES (v_uid,_plan_slug,_billing,v_credits,v_credits,v_price, now() + (v_days || ' days')::interval)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.worker_fail_ai_job(_job uuid, _reason text, _refund boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid; v_cost numeric; v_from_wallet numeric; v_from_sub numeric; v_new_balance numeric;
BEGIN
  SELECT user_id, cost_try, COALESCE((params->>'from_wallet')::numeric,0), COALESCE((params->>'from_sub')::numeric,0)
    INTO v_user, v_cost, v_from_wallet, v_from_sub
    FROM public.ai_jobs WHERE id=_job;
  IF v_user IS NULL THEN RETURN; END IF;
  IF _refund THEN
    IF v_from_wallet > 0 THEN
      UPDATE wallets SET balance_try = balance_try + v_from_wallet WHERE user_id=v_user
        RETURNING balance_try INTO v_new_balance;
      INSERT INTO wallet_transactions(user_id, kind, amount_try, balance_after, note)
      VALUES (v_user, 'refund', v_from_wallet, v_new_balance, 'ai_job_failed: ' || COALESCE(_reason,''));
    END IF;
    IF v_from_sub > 0 THEN
      UPDATE public.ai_subscriptions SET credits_remaining = credits_remaining + v_from_sub
        WHERE user_id=v_user AND status='active';
    END IF;
  END IF;
  UPDATE public.ai_jobs SET status='failed', error=_reason, updated_at=now() WHERE id=_job;
END $function$;
