-- Fix auto-subscription trigger: products has enum "duration", not "duration_days".
-- Map enum → interval days.
CREATE OR REPLACE FUNCTION public.orders_create_subscription_on_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_item_count integer;
  v_duration_enum duration_type;
  v_days integer;
  v_price numeric(12,2);
  v_key_id uuid;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.product_id IS NOT NULL THEN
    v_product_id := NEW.product_id;
  ELSE
    SELECT COUNT(*), MAX(product_id) INTO v_item_count, v_product_id
      FROM public.order_items WHERE order_id = NEW.id;
    IF v_item_count <> 1 THEN RETURN NEW; END IF;
  END IF;
  IF v_product_id IS NULL THEN RETURN NEW; END IF;

  SELECT duration, price_try INTO v_duration_enum, v_price
    FROM public.products WHERE id = v_product_id;

  v_days := CASE v_duration_enum
    WHEN 'hourly'  THEN NULL      -- too short for auto-renew flow
    WHEN 'daily'   THEN 1
    WHEN 'weekly'  THEN 7
    WHEN 'monthly' THEN 30
    WHEN 'yearly'  THEN 365
    WHEN 'lifetime' THEN NULL
    ELSE NULL
  END;

  IF v_days IS NULL OR v_days < 1 OR v_days > 366 THEN
    RETURN NEW;
  END IF;

  SELECT license_key_id INTO v_key_id
    FROM public.order_keys WHERE order_id = NEW.id LIMIT 1;

  INSERT INTO public.subscriptions AS s (
    user_id, product_id, status, auto_renew, interval_days, price_try,
    last_order_id, current_license_key_id, next_renewal_at, last_renewed_at
  ) VALUES (
    NEW.user_id, v_product_id, 'active', true, v_days, COALESCE(NEW.price_try, v_price),
    NEW.id, v_key_id, now() + (v_days || ' days')::interval, now()
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