
CREATE TABLE IF NOT EXISTS public.ai_subscription_plans (
  slug text PRIMARY KEY,
  name text NOT NULL,
  price_try numeric(10,2) NOT NULL,
  credits int NOT NULL,
  yearly_price_try numeric(10,2),
  yearly_credits int,
  perks jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_subscription_plans TO anon, authenticated;
GRANT ALL ON public.ai_subscription_plans TO service_role;
ALTER TABLE public.ai_subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.ai_subscription_plans FOR SELECT USING (is_active = true);

INSERT INTO public.ai_subscription_plans (slug,name,price_try,credits,yearly_price_try,yearly_credits,perks,sort_order) VALUES
  ('starter','Başlangıç',149,200,1490,2600, '["~20 Hızlı video","~8 HD video","30 gün geçerli","Rakiplerden %60 ucuz"]'::jsonb, 1),
  ('pro','Pro',299,500,2990,6500, '["~50 Hızlı video","~20 HD video","~10 Sinematik","30 gün geçerli","EN POPÜLER"]'::jsonb, 2),
  ('studio','Stüdyo',599,1200,5990,15600, '["~120 Hızlı video","~48 HD video","~24 Sinematik","Multi-scene öncelik","30 gün geçerli"]'::jsonb, 3)
ON CONFLICT (slug) DO UPDATE SET
  price_try = EXCLUDED.price_try, credits = EXCLUDED.credits,
  yearly_price_try = EXCLUDED.yearly_price_try, yearly_credits = EXCLUDED.yearly_credits,
  perks = EXCLUDED.perks;

CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_slug text NOT NULL REFERENCES public.ai_subscription_plans(slug),
  billing text NOT NULL DEFAULT 'monthly' CHECK (billing IN ('monthly','yearly')),
  credits_total int NOT NULL,
  credits_remaining numeric(10,2) NOT NULL,
  price_paid numeric(10,2) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_subs_user_active ON public.ai_subscriptions(user_id) WHERE status='active';
GRANT SELECT ON public.ai_subscriptions TO authenticated;
GRANT ALL ON public.ai_subscriptions TO service_role;
ALTER TABLE public.ai_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ai_subs" ON public.ai_subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.purchase_ai_subscription(_plan_slug text, _billing text DEFAULT 'monthly')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_plan public.ai_subscription_plans;
  v_price numeric; v_credits int; v_days int; v_balance numeric; v_id uuid;
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
  UPDATE wallets SET balance_try = balance_try - v_price WHERE user_id=v_uid;
  INSERT INTO wallet_transactions(user_id,direction,amount_try,reason,meta)
    VALUES (v_uid,'debit',v_price,'ai_subscription',
            jsonb_build_object('plan',_plan_slug,'billing',_billing,'credits',v_credits));
  UPDATE public.ai_subscriptions SET status='expired' WHERE user_id=v_uid AND status='active';
  INSERT INTO public.ai_subscriptions(user_id,plan_slug,billing,credits_total,credits_remaining,price_paid,expires_at)
  VALUES (v_uid,_plan_slug,_billing,v_credits,v_credits,v_price, now() + (v_days || ' days')::interval)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.purchase_ai_subscription(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_ai_video_job(_prompt text, _duration integer, _aspect text, _quality text DEFAULT 'fast')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_cost numeric; v_balance numeric;
  v_sub public.ai_subscriptions; v_from_sub numeric := 0; v_from_wallet numeric := 0; v_job uuid;
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
    UPDATE wallets SET balance_try = balance_try - v_from_wallet WHERE user_id=v_uid;
    INSERT INTO wallet_transactions(user_id,direction,amount_try,reason,meta)
    VALUES (v_uid,'debit',v_from_wallet,'ai_video',
            jsonb_build_object('quality',_quality,'duration',_duration,'from_sub',v_from_sub));
  END IF;
  INSERT INTO ai_jobs(user_id,kind,prompt,params,cost_try,status,expires_at,provider)
  VALUES (v_uid,'video',_prompt,
          jsonb_build_object('duration',_duration,'aspect',_aspect,'quality',_quality,'from_sub',v_from_sub,'from_wallet',v_from_wallet),
          v_cost,'queued', now()+interval '30 days','fal')
  RETURNING id INTO v_job;
  RETURN v_job;
END $$;
GRANT EXECUTE ON FUNCTION public.create_ai_video_job(text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_ai_subscriptions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.ai_subscriptions SET status='expired' WHERE status='active' AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END $$;
