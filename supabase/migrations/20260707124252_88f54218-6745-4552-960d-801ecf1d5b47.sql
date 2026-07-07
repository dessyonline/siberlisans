
DROP FUNCTION IF EXISTS public.approve_order(uuid);

DO $$ BEGIN
  CREATE TYPE public.delivery_type AS ENUM ('key','account','link','link_token');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_type public.delivery_type NOT NULL DEFAULT 'key';

ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS activation_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.approve_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id UUID;
  v_status public.order_status;
  v_delivery public.delivery_type;
  v_key_id UUID;
  v_key_value TEXT;
  v_token TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  SELECT o.product_id, o.status, p.delivery_type
    INTO v_product_id, v_status, v_delivery
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.id = _order_id FOR UPDATE;

  IF v_product_id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'Sipariş zaten onaylı'; END IF;

  SELECT id, key_value INTO v_key_id, v_key_value
  FROM public.license_keys
  WHERE product_id = v_product_id AND status = 'available'
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN RAISE EXCEPTION 'Bu ürün için stokta lisans yok'; END IF;

  IF v_delivery = 'link_token' THEN
    v_token := encode(gen_random_bytes(18), 'base64');
    v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
    UPDATE public.license_keys
      SET status = 'assigned',
          assigned_order_id = _order_id,
          assigned_at = now(),
          activation_token = COALESCE(activation_token, v_token)
      WHERE id = v_key_id
      RETURNING activation_token INTO v_token;
  ELSE
    UPDATE public.license_keys
      SET status = 'assigned',
          assigned_order_id = _order_id,
          assigned_at = now()
      WHERE id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id) VALUES (_order_id, v_key_id);
  UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;

  RETURN QUERY SELECT v_key_value, v_token;
END; $function$;

GRANT EXECUTE ON FUNCTION public.approve_order(uuid) TO authenticated;

DROP POLICY IF EXISTS "Public claim by token" ON public.license_keys;
CREATE POLICY "Public claim by token"
  ON public.license_keys
  FOR SELECT
  TO anon, authenticated
  USING (activation_token IS NOT NULL);

DROP POLICY IF EXISTS "Public claim update" ON public.license_keys;
CREATE POLICY "Public claim update"
  ON public.license_keys
  FOR UPDATE
  TO anon, authenticated
  USING (activation_token IS NOT NULL)
  WITH CHECK (activation_token IS NOT NULL);

GRANT SELECT, UPDATE (claimed_at) ON public.license_keys TO anon;
GRANT SELECT, UPDATE (claimed_at) ON public.license_keys TO authenticated;
