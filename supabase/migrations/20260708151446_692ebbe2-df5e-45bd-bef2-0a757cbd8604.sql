-- FAZ 2: Sepet & Çoklu Ürün desteği

-- 1) order_items tablosu
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 50),
  unit_price_try numeric(12,2) NOT NULL,
  product_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX order_items_product_id_idx ON public.order_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users insert own order items"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins manage order items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) orders.product_id nullable (çoklu ürün siparişlerinde boş)
ALTER TABLE public.orders ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 1;

-- 3) Çoklu ürün sipariş oluşturucu — tek transaction'da orders + order_items
CREATE OR REPLACE FUNCTION public.create_cart_order(_items jsonb)
RETURNS TABLE(order_id uuid, reference_code text, total_try numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_available int;
  v_total numeric(12,2) := 0;
  v_ref text;
  v_order_id uuid;
  v_count int;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Sepet boş'; END IF;
  IF jsonb_array_length(_items) > 20 THEN RAISE EXCEPTION 'En fazla 20 farklı ürün eklenebilir'; END IF;

  v_ref := 'SBR-';
  FOR v_i IN 1..8 LOOP
    v_ref := v_ref || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  END LOOP;

  v_count := 0;
  -- Ön kontrol: her ürün geçerli mi, stok var mı?
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
        RAISE EXCEPTION '"%": stokta yeterli anahtar yok (%s adet mevcut, %s isteniyor)',
          v_product.name, v_available, v_qty;
      END IF;
    END IF;

    v_total := v_total + (v_product.price_try * v_qty);
    v_count := v_count + v_qty;
  END LOOP;

  -- Siparişi oluştur (product_id = NULL çoklu ürün göstergesi)
  INSERT INTO public.orders (user_id, product_id, price_try, reference_code, status, item_count)
    VALUES (v_uid, NULL, v_total, v_ref, 'pending', v_count)
    RETURNING id INTO v_order_id;

  -- order_items ekle
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'productId')::uuid;
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
      VALUES (v_order_id, v_product.id, v_qty, v_product.price_try, v_product.name);
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_ref, v_total;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_cart_order(jsonb) TO authenticated;

-- 4) _assign_key_to_order'ı çoklu ürün destekli hale getir
CREATE OR REPLACE FUNCTION public._assign_key_to_order(_order_id uuid)
RETURNS TABLE(license_key text, activation_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_product uuid;
  v_has_items boolean;
  v_item RECORD;
  v_product_id uuid; v_delivery public.delivery_type; v_slug text;
  v_key_id uuid; v_key_value text; v_token text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_seg text; v_new_key text; v_attempt int; v_i int; v_j int;
  v_is_lovable boolean;
  v_first_key text := NULL;
  v_first_token text := NULL;
  v_qi int;
BEGIN
  SELECT o.product_id INTO v_order_product FROM public.orders o WHERE o.id = _order_id;
  SELECT EXISTS(SELECT 1 FROM public.order_items WHERE order_id = _order_id) INTO v_has_items;

  IF NOT v_has_items AND v_order_product IS NULL THEN
    RAISE EXCEPTION 'Sipariş için ürün bulunamadı';
  END IF;

  -- Tek ürün eski yol (order.product_id set, order_items yok)
  IF NOT v_has_items THEN
    -- Sanal tek item olarak işle
    FOR v_qi IN 1..1 LOOP
      SELECT p.id, p.delivery_type, p.slug INTO v_product_id, v_delivery, v_slug
        FROM public.products p WHERE p.id = v_order_product;

      v_is_lovable := (v_product_id = '4f6d86cf-6a89-4940-90af-953cc3d6ab5f'::uuid)
                   OR (v_slug ILIKE 'lovable%');

      SELECT id, key_value INTO v_key_id, v_key_value
      FROM public.license_keys
      WHERE product_id = v_product_id AND status = 'available'
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

      IF v_key_id IS NULL AND v_delivery = 'key' AND v_is_lovable THEN
        v_attempt := 0;
        LOOP
          v_attempt := v_attempt + 1;
          v_new_key := 'SIBER';
          FOR v_i IN 1..3 LOOP
            v_seg := '';
            FOR v_j IN 1..4 LOOP
              v_seg := v_seg || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
            END LOOP;
            v_new_key := v_new_key || '-' || v_seg;
          END LOOP;
          BEGIN
            INSERT INTO public.license_keys (product_id, key_value, status)
            VALUES (v_product_id, v_new_key, 'available')
            RETURNING id, key_value INTO v_key_id, v_key_value;
            EXIT;
          EXCEPTION WHEN unique_violation THEN
            IF v_attempt > 12 THEN RAISE EXCEPTION 'Key üretilemedi'; END IF;
          END;
        END LOOP;
      END IF;

      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Bu ürün için stokta anahtar yok. Lütfen admin panelinden anahtar ekleyin.';
      END IF;

      IF v_delivery = 'link_token' THEN
        v_token := encode(public.gen_random_bytes(18), 'base64');
        v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
        UPDATE public.license_keys
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
              activation_token = COALESCE(activation_token, v_token)
          WHERE id = v_key_id RETURNING activation_token INTO v_token;
      ELSE
        UPDATE public.license_keys
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
          WHERE id = v_key_id;
        v_token := NULL;
      END IF;

      INSERT INTO public.order_keys (order_id, license_key_id)
        VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

      v_first_key := v_key_value;
      v_first_token := v_token;
    END LOOP;

    RETURN QUERY SELECT v_first_key, v_first_token;
    RETURN;
  END IF;

  -- Çoklu ürün: her item için quantity kadar key ata
  FOR v_item IN
    SELECT oi.product_id, oi.quantity, p.delivery_type, p.slug
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
    ORDER BY oi.created_at
  LOOP
    v_product_id := v_item.product_id;
    v_delivery := v_item.delivery_type;
    v_slug := v_item.slug;
    v_is_lovable := (v_product_id = '4f6d86cf-6a89-4940-90af-953cc3d6ab5f'::uuid)
                 OR (v_slug ILIKE 'lovable%');

    FOR v_qi IN 1..v_item.quantity LOOP
      SELECT id, key_value INTO v_key_id, v_key_value
      FROM public.license_keys
      WHERE product_id = v_product_id AND status = 'available'
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

      IF v_key_id IS NULL AND v_delivery = 'key' AND v_is_lovable THEN
        v_attempt := 0;
        LOOP
          v_attempt := v_attempt + 1;
          v_new_key := 'SIBER';
          FOR v_i IN 1..3 LOOP
            v_seg := '';
            FOR v_j IN 1..4 LOOP
              v_seg := v_seg || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
            END LOOP;
            v_new_key := v_new_key || '-' || v_seg;
          END LOOP;
          BEGIN
            INSERT INTO public.license_keys (product_id, key_value, status)
            VALUES (v_product_id, v_new_key, 'available')
            RETURNING id, key_value INTO v_key_id, v_key_value;
            EXIT;
          EXCEPTION WHEN unique_violation THEN
            IF v_attempt > 12 THEN RAISE EXCEPTION 'Key üretilemedi'; END IF;
          END;
        END LOOP;
      END IF;

      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Stokta anahtar tükendi (ürün id: %)', v_product_id;
      END IF;

      IF v_delivery = 'link_token' THEN
        v_token := encode(public.gen_random_bytes(18), 'base64');
        v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
        UPDATE public.license_keys
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
              activation_token = COALESCE(activation_token, v_token)
          WHERE id = v_key_id RETURNING activation_token INTO v_token;
      ELSE
        UPDATE public.license_keys
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
          WHERE id = v_key_id;
        v_token := NULL;
      END IF;

      INSERT INTO public.order_keys (order_id, license_key_id)
        VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

      IF v_first_key IS NULL THEN
        v_first_key := v_key_value;
        v_first_token := v_token;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_first_key, v_first_token;
END; $$;