
-- ============================================================
-- Faz 1: Subscriptions + auto-renewal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','canceled','failed')),
  auto_renew boolean NOT NULL DEFAULT true,
  interval_days integer NOT NULL CHECK (interval_days BETWEEN 1 AND 366),
  price_try numeric(12,2) NOT NULL CHECK (price_try >= 0),
  last_order_id uuid,
  current_license_key_id uuid,
  next_renewal_at timestamptz NOT NULL,
  last_renewed_at timestamptz,
  last_attempt_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

GRANT SELECT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subs"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all subs"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage subs"
  ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS subs_user_status_idx ON public.subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS subs_due_idx ON public.subscriptions(next_renewal_at) WHERE status='active' AND auto_renew;

-- Attempts
CREATE TABLE IF NOT EXISTS public.subscription_renewal_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('success','insufficient_funds','no_stock','error','canceled')),
  error_message text,
  order_id uuid,
  amount_try numeric(12,2)
);

GRANT SELECT ON public.subscription_renewal_attempts TO authenticated;
GRANT ALL ON public.subscription_renewal_attempts TO service_role;
ALTER TABLE public.subscription_renewal_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own attempts"
  ON public.subscription_renewal_attempts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Admins read all attempts"
  ON public.subscription_renewal_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS sub_attempts_sub_idx ON public.subscription_renewal_attempts(subscription_id, attempted_at DESC);

-- updated_at trigger (reuse existing helper if present)
CREATE OR REPLACE FUNCTION public.subscriptions_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS subs_touch_updated ON public.subscriptions;
CREATE TRIGGER subs_touch_updated BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.subscriptions_touch_updated();

-- ============================================================
-- Auto-create subscription when an order is approved
-- ============================================================
CREATE OR REPLACE FUNCTION public.orders_create_subscription_on_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_item_count integer;
  v_duration integer;
  v_price numeric(12,2);
  v_key_id uuid;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  -- Determine single product on this order
  IF NEW.product_id IS NOT NULL THEN
    v_product_id := NEW.product_id;
  ELSE
    SELECT COUNT(*), MAX(product_id) INTO v_item_count, v_product_id
      FROM public.order_items WHERE order_id = NEW.id;
    -- Only auto-subscribe if exactly one product line
    IF v_item_count <> 1 THEN RETURN NEW; END IF;
  END IF;
  IF v_product_id IS NULL THEN RETURN NEW; END IF;

  SELECT duration_days, price_try INTO v_duration, v_price
    FROM public.products WHERE id = v_product_id;

  IF v_duration IS NULL OR v_duration < 1 OR v_duration > 366 THEN
    RETURN NEW;
  END IF;

  SELECT license_key_id INTO v_key_id
    FROM public.order_keys WHERE order_id = NEW.id LIMIT 1;

  INSERT INTO public.subscriptions AS s (
    user_id, product_id, status, auto_renew, interval_days, price_try,
    last_order_id, current_license_key_id, next_renewal_at, last_renewed_at
  ) VALUES (
    NEW.user_id, v_product_id, 'active', true, v_duration, COALESCE(NEW.price_try, v_price),
    NEW.id, v_key_id, now() + (v_duration || ' days')::interval, now()
  )
  ON CONFLICT (user_id, product_id) DO UPDATE
    SET status = 'active',
        auto_renew = COALESCE(s.auto_renew, true),
        interval_days = EXCLUDED.interval_days,
        price_try = EXCLUDED.price_try,
        last_order_id = EXCLUDED.last_order_id,
        current_license_key_id = EXCLUDED.current_license_key_id,
        next_renewal_at = EXCLUDED.next_renewal_at,
        last_renewed_at = now(),
        failure_count = 0,
        canceled_at = NULL,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_create_subscription_trg ON public.orders;
CREATE TRIGGER orders_create_subscription_trg
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_create_subscription_on_approve();

-- ============================================================
-- Renew one subscription (called by cron OR user)
-- ============================================================
CREATE OR REPLACE FUNCTION public.renew_subscription(_sub_id uuid)
RETURNS TABLE(outcome text, order_id uuid, license_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_price numeric(12,2);
  v_balance numeric(12,2);
  v_new_order_id uuid;
  v_key text; v_token text;
  v_ref text;
  v_key_id uuid;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = _sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'error'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF v_sub.status <> 'active' OR NOT v_sub.auto_renew THEN
    INSERT INTO public.subscription_renewal_attempts(subscription_id, outcome, error_message)
      VALUES (_sub_id, 'canceled', 'Sub not active or auto_renew off');
    RETURN QUERY SELECT 'canceled'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF v_sub.product_id IS NULL THEN
    UPDATE public.subscriptions SET status='failed', auto_renew=false, updated_at=now() WHERE id=_sub_id;
    INSERT INTO public.subscription_renewal_attempts(subscription_id, outcome, error_message)
      VALUES (_sub_id, 'error', 'Product no longer exists');
    RETURN QUERY SELECT 'error'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  -- Use current product price (so admin price updates flow)
  SELECT price_try INTO v_price FROM public.products WHERE id = v_sub.product_id;
  IF v_price IS NULL THEN v_price := v_sub.price_try; END IF;

  -- Check wallet
  SELECT balance_try INTO v_balance FROM public.wallets WHERE user_id = v_sub.user_id FOR UPDATE;
  v_balance := COALESCE(v_balance, 0);

  IF v_balance < v_price THEN
    UPDATE public.subscriptions
      SET failure_count = failure_count + 1,
          last_attempt_at = now(),
          status = CASE WHEN failure_count + 1 >= 3 THEN 'failed' ELSE status END,
          auto_renew = CASE WHEN failure_count + 1 >= 3 THEN false ELSE auto_renew END,
          updated_at = now()
      WHERE id = _sub_id;
    INSERT INTO public.subscription_renewal_attempts(subscription_id, outcome, error_message, amount_try)
      VALUES (_sub_id, 'insufficient_funds', 'Balance ' || v_balance || ' < ' || v_price, v_price);
    RETURN QUERY SELECT 'insufficient_funds'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  -- Generate reference code
  v_ref := 'REN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  -- Create renewal order
  PERFORM set_config('app.trusted_op', '1', true);
  INSERT INTO public.orders (
    user_id, product_id, reference_code, price_try, status, approved_at, paid_with
  ) VALUES (
    v_sub.user_id, v_sub.product_id, v_ref, v_price, 'approved', now(), 'wallet'
  ) RETURNING id INTO v_new_order_id;

  -- Deduct wallet
  UPDATE public.wallets
    SET balance_try = balance_try - v_price, updated_at = now()
    WHERE user_id = v_sub.user_id RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
    VALUES (v_sub.user_id, 'purchase', -v_price, v_balance, v_new_order_id, 'Abonelik yenileme: ' || v_ref, v_sub.user_id);

  -- Assign key
  BEGIN
    SELECT license_key, activation_token INTO v_key, v_token
      FROM public._assign_key_to_order(v_new_order_id);
  EXCEPTION WHEN OTHERS THEN
    -- Rollback: refund wallet + mark order failed
    UPDATE public.wallets
      SET balance_try = balance_try + v_price, updated_at = now()
      WHERE user_id = v_sub.user_id RETURNING balance_try INTO v_balance;
    INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
      VALUES (v_sub.user_id, 'refund', v_price, v_balance, v_new_order_id, 'Yenileme başarısız iade', v_sub.user_id);
    UPDATE public.orders SET status='failed', updated_at=now() WHERE id = v_new_order_id;

    UPDATE public.subscriptions
      SET failure_count = failure_count + 1,
          last_attempt_at = now(),
          status = CASE WHEN failure_count + 1 >= 3 THEN 'failed' ELSE status END,
          auto_renew = CASE WHEN failure_count + 1 >= 3 THEN false ELSE auto_renew END,
          updated_at = now()
      WHERE id = _sub_id;
    INSERT INTO public.subscription_renewal_attempts(subscription_id, outcome, error_message, order_id, amount_try)
      VALUES (_sub_id, 'no_stock', SQLERRM, v_new_order_id, v_price);
    RETURN QUERY SELECT 'no_stock'::text, v_new_order_id, NULL::text; RETURN;
  END;

  SELECT license_key_id INTO v_key_id
    FROM public.order_keys WHERE order_id = v_new_order_id LIMIT 1;

  UPDATE public.subscriptions
    SET last_order_id = v_new_order_id,
        current_license_key_id = v_key_id,
        last_renewed_at = now(),
        last_attempt_at = now(),
        next_renewal_at = now() + (interval_days || ' days')::interval,
        failure_count = 0,
        updated_at = now()
    WHERE id = _sub_id;

  INSERT INTO public.subscription_renewal_attempts(subscription_id, outcome, order_id, amount_try)
    VALUES (_sub_id, 'success', v_new_order_id, v_price);

  RETURN QUERY SELECT 'success'::text, v_new_order_id, v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_subscription(uuid) TO authenticated, service_role;

-- ============================================================
-- Batch: process all due subscriptions
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_due_subscriptions()
RETURNS TABLE(processed integer, succeeded integer, failed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid;
  v_result RECORD;
  v_processed int := 0;
  v_ok int := 0;
  v_fail int := 0;
BEGIN
  FOR v_sub_id IN
    SELECT id FROM public.subscriptions
    WHERE status = 'active'
      AND auto_renew = true
      AND next_renewal_at <= now() + interval '24 hours'
      AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '6 hours')
    ORDER BY next_renewal_at ASC
    LIMIT 200
  LOOP
    BEGIN
      SELECT * INTO v_result FROM public.renew_subscription(v_sub_id);
      v_processed := v_processed + 1;
      IF v_result.outcome = 'success' THEN v_ok := v_ok + 1;
      ELSE v_fail := v_fail + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
      INSERT INTO public.subscription_renewal_attempts(subscription_id, outcome, error_message)
        VALUES (v_sub_id, 'error', SQLERRM);
    END;
  END LOOP;
  RETURN QUERY SELECT v_processed, v_ok, v_fail;
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_subscriptions() TO service_role;

-- ============================================================
-- User-facing helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_subscription_auto_renew(_sub_id uuid, _on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid; BEGIN
  SELECT user_id INTO v_owner FROM public.subscriptions WHERE id = _sub_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Abonelik yok'; END IF;
  IF v_owner <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  UPDATE public.subscriptions
    SET auto_renew = _on,
        status = CASE WHEN _on AND status='failed' THEN 'active' ELSE status END,
        failure_count = CASE WHEN _on AND status='failed' THEN 0 ELSE failure_count END,
        updated_at = now()
    WHERE id = _sub_id;
  RETURN _on;
END; $$;

REVOKE ALL ON FUNCTION public.set_subscription_auto_renew(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_subscription_auto_renew(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_subscription(_sub_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid; BEGIN
  SELECT user_id INTO v_owner FROM public.subscriptions WHERE id = _sub_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Abonelik yok'; END IF;
  IF v_owner <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  UPDATE public.subscriptions
    SET status='canceled', auto_renew=false, canceled_at=now(), updated_at=now()
    WHERE id = _sub_id;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.cancel_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_subscription(uuid) TO authenticated;
