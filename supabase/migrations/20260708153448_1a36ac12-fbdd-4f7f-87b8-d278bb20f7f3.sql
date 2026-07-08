
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;

-- Notify admin via Telegram (best-effort, via pg_net) when a product goes low/empty.
-- Uses a dedicated table to throttle notifications (max 1 per product per hour).
CREATE TABLE IF NOT EXISTS public.low_stock_alerts (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_available INTEGER NOT NULL DEFAULT 0
);

GRANT ALL ON public.low_stock_alerts TO service_role;
ALTER TABLE public.low_stock_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read alerts" ON public.low_stock_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RPC: return low-stock products (used by dashboard)
CREATE OR REPLACE FUNCTION public.admin_low_stock_products()
RETURNS TABLE(product_id UUID, name TEXT, slug TEXT, available INTEGER, threshold INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.slug,
    COALESCE((SELECT COUNT(*)::int FROM public.license_keys lk
              WHERE lk.product_id = p.id AND lk.status = 'available'), 0) AS available,
    p.low_stock_threshold
  FROM public.products p
  WHERE p.active = true
    AND NOT p.unlimited_stock
    AND NOT p.manual_fulfillment
    AND COALESCE((SELECT COUNT(*) FROM public.license_keys lk
             WHERE lk.product_id = p.id AND lk.status = 'available'), 0) < p.low_stock_threshold
  ORDER BY available ASC, p.name;
$$;

REVOKE ALL ON FUNCTION public.admin_low_stock_products() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_low_stock_products() TO authenticated;

-- Called from server code (after key assignments) to record & signal
CREATE OR REPLACE FUNCTION public.check_low_stock_after_assign(_product_id UUID)
RETURNS TABLE(should_alert BOOLEAN, product_name TEXT, available INTEGER, threshold INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available INTEGER;
  v_threshold INTEGER;
  v_name TEXT;
  v_unlimited BOOLEAN;
  v_manual BOOLEAN;
  v_last_sent TIMESTAMPTZ;
BEGIN
  SELECT p.low_stock_threshold, p.name, p.unlimited_stock, p.manual_fulfillment
    INTO v_threshold, v_name, v_unlimited, v_manual
  FROM public.products p WHERE p.id = _product_id;

  IF v_unlimited OR v_manual OR v_threshold IS NULL THEN
    RETURN QUERY SELECT false, v_name, 0, v_threshold;
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_available
  FROM public.license_keys
  WHERE product_id = _product_id AND status = 'available';

  IF v_available >= v_threshold THEN
    DELETE FROM public.low_stock_alerts WHERE product_id = _product_id;
    RETURN QUERY SELECT false, v_name, v_available, v_threshold;
    RETURN;
  END IF;

  SELECT last_sent_at INTO v_last_sent FROM public.low_stock_alerts
    WHERE product_id = _product_id;

  IF v_last_sent IS NOT NULL AND v_last_sent > now() - interval '1 hour' THEN
    RETURN QUERY SELECT false, v_name, v_available, v_threshold;
    RETURN;
  END IF;

  INSERT INTO public.low_stock_alerts (product_id, last_sent_at, last_available)
    VALUES (_product_id, now(), v_available)
    ON CONFLICT (product_id) DO UPDATE
      SET last_sent_at = now(), last_available = EXCLUDED.last_available;

  RETURN QUERY SELECT true, v_name, v_available, v_threshold;
END;
$$;

REVOKE ALL ON FUNCTION public.check_low_stock_after_assign(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.check_low_stock_after_assign(UUID) TO authenticated, service_role;
