CREATE OR REPLACE FUNCTION public.grant_dealer_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dealer uuid; v_base numeric(12,2);
  v_discount numeric(12,2) := 0; v_volume numeric(12,2);
  v_tier record;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT dealer_id INTO v_dealer FROM public.profiles WHERE id = NEW.user_id;

  -- bayinin kendi alımı ciroya sayılır
  IF EXISTS (SELECT 1 FROM public.dealers WHERE user_id = NEW.user_id) THEN
    SELECT COALESCE(SUM(discount_try),0) INTO v_discount FROM public.order_discounts WHERE order_id = NEW.id;
    UPDATE public.dealers
      SET total_volume_try = total_volume_try + GREATEST(0, NEW.price_try - v_discount), updated_at = now()
      WHERE user_id = NEW.user_id
      RETURNING total_volume_try INTO v_volume;
    SELECT * INTO v_tier FROM public.dealer_tiers WHERE min_volume_try <= v_volume ORDER BY min_volume_try DESC LIMIT 1;
    IF v_tier.slug IS NOT NULL THEN
      UPDATE public.dealers SET tier_slug = v_tier.slug WHERE user_id = NEW.user_id AND tier_slug <> v_tier.slug;
    END IF;
  END IF;

  IF v_dealer IS NULL OR v_dealer = NEW.user_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dealers WHERE user_id = v_dealer AND active = true) THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_discount FROM public.order_discounts WHERE order_id = NEW.id;
  v_base := GREATEST(0, NEW.price_try - v_discount);
  IF v_base <= 0 THEN RETURN NEW; END IF;

  -- KOMİSYON KAPALI: yalnızca ciro ve seviye güncellenir
  UPDATE public.dealers
    SET total_volume_try = total_volume_try + v_base, updated_at = now()
    WHERE user_id = v_dealer
    RETURNING total_volume_try INTO v_volume;

  SELECT * INTO v_tier FROM public.dealer_tiers WHERE min_volume_try <= v_volume ORDER BY min_volume_try DESC LIMIT 1;
  IF v_tier.slug IS NOT NULL THEN
    UPDATE public.dealers SET tier_slug = v_tier.slug WHERE user_id = v_dealer AND tier_slug <> v_tier.slug;
  END IF;

  RETURN NEW;
END; $function$;