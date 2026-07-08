
-- 1) products yeni alanlar
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS orders_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 2) product_reviews
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_public_read" ON public.product_reviews
  FOR SELECT USING (true);
CREATE POLICY "reviews_owner_write" ON public.product_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      LEFT JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.user_id = auth.uid()
        AND o.status = 'approved'
        AND (o.product_id = product_reviews.product_id OR oi.product_id = product_reviews.product_id)
    )
  );
CREATE POLICY "reviews_owner_update" ON public.product_reviews
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_owner_delete" ON public.product_reviews
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tg_product_reviews_updated
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Ürün ortalamasını güncelleyen trigger
CREATE OR REPLACE FUNCTION public.tg_refresh_product_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid;
BEGIN
  v_pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE public.products p SET
    review_count = (SELECT COUNT(*) FROM public.product_reviews WHERE product_id = v_pid),
    avg_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric,2) FROM public.product_reviews WHERE product_id = v_pid), 0)
  WHERE p.id = v_pid;
  RETURN NULL;
END; $$;

CREATE TRIGGER tg_reviews_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_product_rating();

-- 3) favorites
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fav_owner_all" ON public.favorites
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','amount')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_try NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_read_active" ON public.coupons
  FOR SELECT TO authenticated USING (is_active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "coupons_admin_write" ON public.coupons
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tg_coupons_updated
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  discount_try NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "redemp_owner_read" ON public.coupon_redemptions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 5) validate_coupon RPC
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _subtotal numeric)
RETURNS TABLE(coupon_id uuid, code text, discount_try numeric, final_try numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.coupons%ROWTYPE;
  v_code text;
  v_disc numeric;
  v_used int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  v_code := upper(btrim(coalesce(_code,'')));
  IF v_code = '' THEN RAISE EXCEPTION 'Kod boş'; END IF;

  SELECT * INTO v_c FROM public.coupons WHERE upper(code) = v_code;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Kupon bulunamadı'; END IF;
  IF NOT v_c.is_active THEN RAISE EXCEPTION 'Kupon aktif değil'; END IF;
  IF v_c.expires_at IS NOT NULL AND v_c.expires_at < now() THEN
    RAISE EXCEPTION 'Kuponun süresi dolmuş';
  END IF;
  IF v_c.max_uses IS NOT NULL AND v_c.used_count >= v_c.max_uses THEN
    RAISE EXCEPTION 'Kupon kullanım limiti dolmuş';
  END IF;
  IF _subtotal < v_c.min_order_try THEN
    RAISE EXCEPTION 'Minimum sepet tutarı: ₺%', v_c.min_order_try;
  END IF;

  SELECT COUNT(*) INTO v_used FROM public.coupon_redemptions
    WHERE coupon_id = v_c.id AND user_id = v_uid;
  IF v_used > 0 THEN RAISE EXCEPTION 'Bu kuponu daha önce kullandınız'; END IF;

  IF v_c.discount_type = 'percent' THEN
    v_disc := round(_subtotal * v_c.discount_value / 100.0, 2);
  ELSE
    v_disc := v_c.discount_value;
  END IF;
  IF v_disc > _subtotal THEN v_disc := _subtotal; END IF;

  RETURN QUERY SELECT v_c.id, v_c.code, v_disc, (_subtotal - v_disc);
END; $$;

-- 6) create_cart_order kupon destekli hale getir
CREATE OR REPLACE FUNCTION public.create_cart_order(_items jsonb, _coupon_code text DEFAULT NULL)
RETURNS TABLE(order_id uuid, reference_code text, total_try numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_available int;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_ref text;
  v_order_id uuid;
  v_count int;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i int;
  v_coupon record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Sepet boş'; END IF;
  IF jsonb_array_length(_items) > 20 THEN RAISE EXCEPTION 'En fazla 20 farklı ürün eklenebilir'; END IF;

  v_ref := 'SBR-';
  FOR v_i IN 1..8 LOOP
    v_ref := v_ref || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  END LOOP;

  v_count := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Geçersiz adet'; END IF;
    SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'productId')::uuid AND active = true;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Ürün bulunamadı veya pasif'; END IF;
    IF NOT v_product.manual_fulfillment AND NOT v_product.unlimited_stock THEN
      SELECT COUNT(*) INTO v_available FROM public.license_keys
        WHERE product_id = v_product.id AND status = 'available';
      IF v_available < v_qty THEN
        RAISE EXCEPTION '"%": stokta yeterli anahtar yok (% adet mevcut, % isteniyor)',
          v_product.name, v_available, v_qty;
      END IF;
    END IF;
    v_subtotal := v_subtotal + (v_product.price_try * v_qty);
    v_count := v_count + v_qty;
  END LOOP;

  -- Kupon uygula
  IF _coupon_code IS NOT NULL AND btrim(_coupon_code) <> '' THEN
    SELECT * INTO v_coupon FROM public.validate_coupon(_coupon_code, v_subtotal);
    IF v_coupon.coupon_id IS NULL THEN RAISE EXCEPTION 'Geçersiz kupon'; END IF;
    v_discount := v_coupon.discount_try;
  END IF;

  v_total := GREATEST(0, v_subtotal - v_discount);

  INSERT INTO public.orders (user_id, product_id, price_try, reference_code, status, item_count)
    VALUES (v_uid, NULL, v_total, v_ref, 'pending', v_count)
    RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'productId')::uuid;
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
      VALUES (v_order_id, v_product.id, v_qty, v_product.price_try, v_product.name);
  END LOOP;

  IF v_discount > 0 AND v_coupon.coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id, discount_try)
      VALUES (v_coupon.coupon_id, v_uid, v_order_id, v_discount);
    UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon.coupon_id;
    INSERT INTO public.order_discounts (order_id, code_snapshot, discount_try)
      VALUES (v_order_id, v_coupon.code, v_discount);
  END IF;

  RETURN QUERY SELECT v_order_id, v_ref, v_total;
END; $$;

-- 7) _assign_key_to_order sonunda orders_count artır (tek trigger fn ile)
CREATE OR REPLACE FUNCTION public.bump_orders_count(_order_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.products p SET orders_count = orders_count + sub.qty
  FROM (
    SELECT product_id, SUM(quantity)::int AS qty
    FROM public.order_items WHERE order_id = _order_id
    GROUP BY product_id
    UNION ALL
    SELECT o.product_id, 1 FROM public.orders o
    WHERE o.id = _order_id AND o.product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = _order_id)
  ) sub
  WHERE p.id = sub.product_id;
$$;
