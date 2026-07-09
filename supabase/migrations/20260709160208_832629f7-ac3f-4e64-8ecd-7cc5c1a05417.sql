
-- Manuel bayrağı olsa bile havuzda müsait key varsa otomatik teslim et
CREATE OR REPLACE FUNCTION public._assign_key_to_order(_order_id uuid)
 RETURNS TABLE(license_key text, activation_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_product uuid;
  v_has_items boolean;
  v_item RECORD;
  v_product_id uuid; v_delivery public.delivery_type; v_slug text;
  v_unlimited boolean; v_manual boolean;
  v_key_id uuid; v_key_value text; v_token text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_seg text; v_new_key text; v_attempt int; v_i int; v_j int;
  v_is_lovable boolean;
  v_first_key text := NULL;
  v_first_token text := NULL;
  v_qi int;
  v_pool_count int;
BEGIN
  SELECT o.product_id INTO v_order_product FROM public.orders o WHERE o.id = _order_id;
  SELECT EXISTS(SELECT 1 FROM public.order_items WHERE order_id = _order_id) INTO v_has_items;

  IF NOT v_has_items AND v_order_product IS NULL THEN
    RAISE EXCEPTION 'Sipariş için ürün bulunamadı';
  END IF;

  IF NOT v_has_items THEN
    SELECT p.id, p.delivery_type, p.slug, COALESCE(p.unlimited_stock,false), COALESCE(p.manual_fulfillment,false)
      INTO v_product_id, v_delivery, v_slug, v_unlimited, v_manual
      FROM public.products p WHERE p.id = v_order_product;

    v_is_lovable := (v_product_id = '4f6d86cf-6a89-4940-90af-953cc3d6ab5f'::uuid)
                 OR (v_slug ILIKE 'lovable%');

    -- Manuel bayrağı olsa bile: havuzda müsait key VEYA sınırsız stok varsa otomatik teslim et
    IF v_manual AND NOT v_unlimited AND NOT v_is_lovable THEN
      SELECT COUNT(*) INTO v_pool_count FROM public.license_keys
        WHERE product_id = v_product_id AND status = 'available' AND COALESCE(revoked,false)=false;
      IF v_pool_count > 0 THEN
        v_manual := false;
      END IF;
    END IF;

    IF v_manual THEN
      license_key := NULL; activation_token := NULL; RETURN NEXT; RETURN;
    END IF;

    IF v_is_lovable THEN
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

      IF v_delivery = 'link_token' THEN
        v_token := encode(public.gen_random_bytes(18), 'base64');
        v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
        UPDATE public.license_keys lk
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
              activation_token = COALESCE(lk.activation_token, v_token)
          WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
      ELSE
        UPDATE public.license_keys lk
          SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
          WHERE lk.id = v_key_id;
        v_token := NULL;
      END IF;

      INSERT INTO public.order_keys (order_id, license_key_id)
        VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

      license_key := v_key_value; activation_token := v_token; RETURN NEXT; RETURN;
    END IF;

    IF v_unlimited THEN
      SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
        FROM public.license_keys lk
        WHERE lk.product_id = v_product_id AND COALESCE(lk.revoked,false) = false
        ORDER BY (lk.status = 'available') DESC, lk.created_at ASC
        LIMIT 1;
      IF v_key_id IS NULL THEN
        RAISE EXCEPTION 'Bu ürün "sınırsız stok" olarak işaretli fakat havuzda hiç key yok. Admin panelden bir key ekle.';
      END IF;
      INSERT INTO public.order_keys (order_id, license_key_id)
        VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;
      license_key := v_key_value; activation_token := NULL; RETURN NEXT; RETURN;
    END IF;

    SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
      FROM public.license_keys lk
      WHERE lk.product_id = v_product_id AND lk.status = 'available'
      ORDER BY lk.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Bu ürün için stokta anahtar yok. Lütfen admin panelinden anahtar ekleyin.';
    END IF;

    IF v_delivery = 'link_token' THEN
      v_token := encode(public.gen_random_bytes(18), 'base64');
      v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
      UPDATE public.license_keys lk
        SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
            activation_token = COALESCE(lk.activation_token, v_token)
        WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
    ELSE
      UPDATE public.license_keys lk
        SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
        WHERE lk.id = v_key_id;
      v_token := NULL;
    END IF;

    INSERT INTO public.order_keys (order_id, license_key_id)
      VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

    license_key := v_key_value; activation_token := v_token; RETURN NEXT; RETURN;
  END IF;

  -- SEPET SİPARİŞİ
  FOR v_item IN
    SELECT oi.product_id, oi.quantity, p.delivery_type, p.slug,
           COALESCE(p.unlimited_stock,false) AS unlimited,
           COALESCE(p.manual_fulfillment,false) AS manual
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
    ORDER BY oi.created_at
  LOOP
    v_product_id := v_item.product_id;
    v_delivery := v_item.delivery_type;
    v_slug := v_item.slug;
    v_unlimited := v_item.unlimited;
    v_manual := v_item.manual;
    v_is_lovable := (v_product_id = '4f6d86cf-6a89-4940-90af-953cc3d6ab5f'::uuid)
                 OR (v_slug ILIKE 'lovable%');

    IF v_manual AND NOT v_unlimited AND NOT v_is_lovable THEN
      SELECT COUNT(*) INTO v_pool_count FROM public.license_keys
        WHERE product_id = v_product_id AND status = 'available' AND COALESCE(revoked,false)=false;
      IF v_pool_count >= v_item.quantity THEN
        v_manual := false;
      END IF;
    END IF;

    IF v_manual THEN
      CONTINUE;
    END IF;

    FOR v_qi IN 1..v_item.quantity LOOP
      IF v_is_lovable THEN
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
        IF v_delivery = 'link_token' THEN
          v_token := encode(public.gen_random_bytes(18), 'base64');
          v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
          UPDATE public.license_keys lk
            SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
                activation_token = COALESCE(lk.activation_token, v_token)
            WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
        ELSE
          UPDATE public.license_keys lk
            SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
            WHERE lk.id = v_key_id;
          v_token := NULL;
        END IF;
      ELSIF v_unlimited THEN
        SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
          FROM public.license_keys lk
          WHERE lk.product_id = v_product_id AND COALESCE(lk.revoked,false) = false
          ORDER BY (lk.status = 'available') DESC, lk.created_at ASC
          LIMIT 1;
        IF v_key_id IS NULL THEN
          RAISE EXCEPTION 'Sınırsız stok ürününde havuzda key yok (ürün id: %)', v_product_id;
        END IF;
        v_token := NULL;
      ELSE
        SELECT lk.id, lk.key_value INTO v_key_id, v_key_value
        FROM public.license_keys lk
        WHERE lk.product_id = v_product_id AND lk.status = 'available'
        ORDER BY lk.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
        IF v_key_id IS NULL THEN
          RAISE EXCEPTION 'Stokta anahtar tükendi (ürün id: %)', v_product_id;
        END IF;
        IF v_delivery = 'link_token' THEN
          v_token := encode(public.gen_random_bytes(18), 'base64');
          v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
          UPDATE public.license_keys lk
            SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
                activation_token = COALESCE(lk.activation_token, v_token)
            WHERE lk.id = v_key_id RETURNING lk.activation_token INTO v_token;
        ELSE
          UPDATE public.license_keys lk
            SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now()
            WHERE lk.id = v_key_id;
          v_token := NULL;
        END IF;
      END IF;

      INSERT INTO public.order_keys (order_id, license_key_id)
        VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;

      IF v_first_key IS NULL THEN
        v_first_key := v_key_value;
        v_first_token := v_token;
      END IF;
    END LOOP;
  END LOOP;

  license_key := v_first_key;
  activation_token := v_first_token;
  RETURN NEXT;
END; $function$;

-- Admin havuz temizleme RPC: bir ürünün müsait (satılmamış) key'lerini siler
CREATE OR REPLACE FUNCTION public.admin_purge_available_keys(_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  WITH d AS (
    DELETE FROM public.license_keys
    WHERE product_id = _product_id AND status = 'available'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM d;
  RETURN COALESCE(v_count, 0);
END; $$;

REVOKE ALL ON FUNCTION public.admin_purge_available_keys(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_available_keys(uuid) TO authenticated;
