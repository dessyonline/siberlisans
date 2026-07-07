
-- Enum for promo type
DO $$ BEGIN
  CREATE TYPE public.promo_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- promo_codes
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type public.promo_type NOT NULL DEFAULT 'percent',
  discount_value NUMERIC NOT NULL CHECK (discount_value >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  min_amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.promo_codes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active promo codes"
  ON public.promo_codes FOR SELECT
  USING (active = true);

CREATE POLICY "Admins manage promo codes"
  ON public.promo_codes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER promo_codes_updated
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- order_discounts
CREATE TABLE IF NOT EXISTS public.order_discounts (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE RESTRICT,
  code_snapshot TEXT NOT NULL,
  discount_try NUMERIC NOT NULL CHECK (discount_try >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_discounts TO authenticated;
GRANT ALL ON public.order_discounts TO service_role;

ALTER TABLE public.order_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own order discounts"
  ON public.order_discounts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- apply_promo_code RPC
CREATE OR REPLACE FUNCTION public.apply_promo_code(_order_id UUID, _code TEXT)
RETURNS TABLE(discount_try NUMERIC, final_price NUMERIC, code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_promo public.promo_codes%ROWTYPE;
  v_disc NUMERIC;
  v_final NUMERIC;
  v_code TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;

  v_code := upper(btrim(coalesce(_code,'')));
  IF v_code = '' THEN RAISE EXCEPTION 'Kod boş olamaz'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Bu sipariş sizin değil'; END IF;
  IF v_order.status NOT IN ('pending','reviewing') THEN
    RAISE EXCEPTION 'Bu aşamada kod uygulanamaz';
  END IF;

  SELECT * INTO v_promo FROM public.promo_codes WHERE upper(code) = v_code FOR UPDATE;
  IF v_promo.id IS NULL THEN RAISE EXCEPTION 'Kod bulunamadı'; END IF;
  IF NOT v_promo.active THEN RAISE EXCEPTION 'Kod aktif değil'; END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RAISE EXCEPTION 'Kodun süresi dolmuş';
  END IF;
  IF v_promo.max_uses IS NOT NULL AND v_promo.used_count >= v_promo.max_uses THEN
    RAISE EXCEPTION 'Kodun kullanım limiti dolmuş';
  END IF;
  IF v_promo.product_id IS NOT NULL AND v_promo.product_id <> v_order.product_id THEN
    RAISE EXCEPTION 'Bu kod bu ürüne uygulanamaz';
  END IF;
  IF v_order.price_try < v_promo.min_amount THEN
    RAISE EXCEPTION 'Minimum tutar: ₺%', v_promo.min_amount;
  END IF;

  -- Compute discount
  IF v_promo.discount_type = 'percent' THEN
    v_disc := round(v_order.price_try * v_promo.discount_value / 100.0, 2);
  ELSE
    v_disc := v_promo.discount_value;
  END IF;
  IF v_disc > v_order.price_try THEN v_disc := v_order.price_try; END IF;
  v_final := v_order.price_try - v_disc;

  -- If order already has a discount, roll it back first
  IF EXISTS (SELECT 1 FROM public.order_discounts WHERE order_id = _order_id) THEN
    UPDATE public.promo_codes SET used_count = GREATEST(used_count - 1, 0)
      WHERE id = (SELECT promo_code_id FROM public.order_discounts WHERE order_id = _order_id);
    DELETE FROM public.order_discounts WHERE order_id = _order_id;
  END IF;

  INSERT INTO public.order_discounts (order_id, promo_code_id, code_snapshot, discount_try)
    VALUES (_order_id, v_promo.id, v_promo.code, v_disc);

  UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = v_promo.id;

  RETURN QUERY SELECT v_disc, v_final, v_promo.code;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_promo_code(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_promo_code(UUID, TEXT) TO authenticated;

-- remove_promo_code RPC
CREATE OR REPLACE FUNCTION public.remove_promo_code(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_promo_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_order.user_id <> v_uid AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  IF v_order.status NOT IN ('pending','reviewing') THEN
    RAISE EXCEPTION 'Bu aşamada kaldırılamaz';
  END IF;

  SELECT promo_code_id INTO v_promo_id FROM public.order_discounts WHERE order_id = _order_id;
  IF v_promo_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.order_discounts WHERE order_id = _order_id;
  UPDATE public.promo_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_promo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_promo_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_promo_code(UUID) TO authenticated;
