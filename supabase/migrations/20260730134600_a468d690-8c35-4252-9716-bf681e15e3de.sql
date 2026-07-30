-- 1) order_keys: paylaşımlı anahtar birden fazla siparişte kullanılabilsin
ALTER TABLE public.order_keys DROP CONSTRAINT IF EXISTS order_keys_license_key_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS order_keys_order_license_uidx
  ON public.order_keys(order_id, license_key_id);

-- 2) Eksik teslim kayıtlarını tamamla
INSERT INTO public.order_keys (order_id, license_key_id, delivered_at)
SELECT lk.assigned_order_id, lk.id, COALESCE(lk.assigned_at, now())
FROM public.license_keys lk
WHERE lk.assigned_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.order_keys ok
    WHERE ok.order_id = lk.assigned_order_id AND ok.license_key_id = lk.id
  )
ON CONFLICT DO NOTHING;

-- 3) approve_order: order_keys insert'lerine çakışma koruması
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
  v_duration public.duration_type;
  v_default_days INT;
  v_unlimited BOOLEAN;
  v_days INT;
  v_expires TIMESTAMPTZ;
  v_key_id UUID;
  v_key_value TEXT;
  v_token TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_seg TEXT;
  v_new_key TEXT;
  v_attempt INT;
  v_i INT;
  v_j INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  SELECT o.product_id, o.status, p.delivery_type, p.duration, p.default_license_days, p.unlimited_stock
    INTO v_product_id, v_status, v_delivery, v_duration, v_default_days, v_unlimited
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.id = _order_id FOR UPDATE;

  IF v_product_id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'Sipariş zaten onaylı'; END IF;

  v_days := COALESCE(v_default_days, CASE v_duration
    WHEN 'hourly' THEN NULL
    WHEN 'daily' THEN 1
    WHEN 'weekly' THEN 7
    WHEN 'monthly' THEN 30
    WHEN 'yearly' THEN 365
    WHEN 'lifetime' THEN NULL
    ELSE NULL
  END);
  IF v_days IS NOT NULL THEN
    v_expires := now() + make_interval(days => v_days);
  END IF;

  IF v_unlimited THEN
    SELECT id, key_value INTO v_key_id, v_key_value
    FROM public.license_keys
    WHERE product_id = v_product_id
    ORDER BY created_at ASC LIMIT 1;
    IF v_key_id IS NULL THEN
      RAISE EXCEPTION 'Sınırsız stok ürünü için havuzda paylaşımlı bir anahtar/link yok';
    END IF;
    INSERT INTO public.order_keys (order_id, license_key_id)
      VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;
    UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;
    RETURN QUERY SELECT v_key_value, NULL::text;
    RETURN;
  END IF;

  SELECT id, key_value INTO v_key_id, v_key_value
  FROM public.license_keys
  WHERE product_id = v_product_id AND status = 'available'
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_key_id IS NULL THEN
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
        INSERT INTO public.license_keys (product_id, key_value, status, duration_days, expires_at)
        VALUES (v_product_id, v_new_key, 'available', v_days, v_expires)
        RETURNING id, key_value INTO v_key_id, v_key_value;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt > 12 THEN RAISE EXCEPTION 'Key üretilemedi'; END IF;
      END;
    END LOOP;
  END IF;

  IF v_delivery = 'link_token' THEN
    IF v_key_value ~* '^https?://' THEN
      UPDATE public.license_keys
        SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
            duration_days = COALESCE(duration_days, v_days),
            expires_at = COALESCE(expires_at, v_expires)
        WHERE id = v_key_id;
      v_token := NULL;
    ELSE
      v_token := encode(gen_random_bytes(18), 'base64');
      v_token := replace(replace(replace(v_token, '+',''), '/',''), '=','');
      UPDATE public.license_keys
        SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
            activation_token = COALESCE(activation_token, v_token),
            duration_days = COALESCE(duration_days, v_days),
            expires_at = COALESCE(expires_at, v_expires)
        WHERE id = v_key_id RETURNING activation_token INTO v_token;
    END IF;
  ELSE
    UPDATE public.license_keys
      SET status = 'assigned', assigned_order_id = _order_id, assigned_at = now(),
          duration_days = COALESCE(duration_days, v_days),
          expires_at = COALESCE(expires_at, v_expires)
      WHERE id = v_key_id;
    v_token := NULL;
  END IF;

  INSERT INTO public.order_keys (order_id, license_key_id)
    VALUES (_order_id, v_key_id) ON CONFLICT DO NOTHING;
  UPDATE public.orders SET status = 'approved', approved_at = now() WHERE id = _order_id;

  RETURN QUERY SELECT v_key_value, v_token;
END; $function$;

-- 4) admin_manual_deliver: çakışma koruması
CREATE OR REPLACE FUNCTION public.admin_manual_deliver(_order_id uuid, _payload text, _note text DEFAULT NULL::text, _duration_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid; v_status text; v_product uuid; v_pname text; v_key uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF _payload IS NULL OR length(btrim(_payload)) = 0 THEN RAISE EXCEPTION 'Teslim içeriği boş olamaz'; END IF;

  SELECT o.user_id, o.status::text, o.product_id, p.name
    INTO v_owner, v_status, v_product, v_pname
    FROM public.orders o LEFT JOIN public.products p ON p.id = o.product_id
   WHERE o.id = _order_id FOR UPDATE OF o;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'İptal/red edilmiş siparişe teslim yapılamaz'; END IF;

  INSERT INTO public.license_keys(product_id, key_value, status, assigned_order_id, assigned_at, duration_days, expires_at)
  VALUES (
    v_product, btrim(_payload), 'assigned', _order_id, now(), _duration_days,
    CASE WHEN _duration_days IS NULL THEN NULL ELSE now() + make_interval(days => _duration_days) END
  )
  RETURNING id INTO v_key;

  INSERT INTO public.order_keys(order_id, license_key_id, delivered_at)
  VALUES (_order_id, v_key, now())
  ON CONFLICT DO NOTHING;

  UPDATE public.orders
     SET status = 'approved',
         approved_at = COALESCE(approved_at, now()),
         admin_note = COALESCE(_note, admin_note),
         updated_at = now()
   WHERE id = _order_id;

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_owner, 'order', 'Siparişin teslim edildi',
          COALESCE(v_pname,'Ürün') || ' teslim edildi. Lisanslarım sayfasından görebilirsin.',
          '/hesabim/lisanslar');

  PERFORM public.log_admin_action('order.manual_deliver','order', _order_id::text, NULL,
    jsonb_build_object('duration_days', _duration_days), jsonb_build_object('note', _note));

  RETURN jsonb_build_object('ok', true, 'license_key_id', v_key);
END; $function$;

-- 5) Ciro raporları: kupon/indirim düşülmüş net tutar
CREATE OR REPLACE FUNCTION public.admin_daily_revenue(_days integer DEFAULT 30)
 RETURNS TABLE(day date, revenue numeric, orders integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  WITH disc AS (
    SELECT order_id, COALESCE(SUM(discount_try),0)::numeric AS d
    FROM public.order_discounts GROUP BY order_id
  )
  SELECT d::date AS day,
    COALESCE(SUM(GREATEST(COALESCE(o.price_try,0) - COALESCE(dc.d,0), 0)),0) AS revenue,
    COALESCE(COUNT(o.id),0)::int AS orders
  FROM generate_series(
    date_trunc('day', now() - (_days || ' days')::interval),
    date_trunc('day', now()), interval '1 day'
  ) AS d
  LEFT JOIN public.orders o
    ON o.status = 'approved'
   AND date_trunc('day', o.approved_at) = d
  LEFT JOIN disc dc ON dc.order_id = o.id
  GROUP BY d ORDER BY d;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
 RETURNS TABLE(today_revenue numeric, today_orders integer, week_revenue numeric, week_orders integer, month_revenue numeric, month_orders integer, pending_count integer, reviewing_count integer, avg_basket numeric, users_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  RETURN QUERY
  WITH disc AS (
    SELECT order_id, COALESCE(SUM(discount_try),0)::numeric AS d
    FROM public.order_discounts GROUP BY order_id
  ),
  o AS (
    SELECT ord.id, ord.status, ord.approved_at,
           GREATEST(COALESCE(ord.price_try,0) - COALESCE(dc.d,0), 0)::numeric AS net_price
    FROM public.orders ord
    LEFT JOIN disc dc ON dc.order_id = ord.id
  )
  SELECT
    COALESCE(SUM(net_price) FILTER (WHERE status='approved' AND approved_at >= date_trunc('day', now())),0),
    COALESCE(COUNT(*) FILTER (WHERE status='approved' AND approved_at >= date_trunc('day', now())),0)::int,
    COALESCE(SUM(net_price) FILTER (WHERE status='approved' AND approved_at >= now() - interval '7 days'),0),
    COALESCE(COUNT(*) FILTER (WHERE status='approved' AND approved_at >= now() - interval '7 days'),0)::int,
    COALESCE(SUM(net_price) FILTER (WHERE status='approved' AND approved_at >= now() - interval '30 days'),0),
    COALESCE(COUNT(*) FILTER (WHERE status='approved' AND approved_at >= now() - interval '30 days'),0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status='pending'),0)::int,
    COALESCE(COUNT(*) FILTER (WHERE status='reviewing'),0)::int,
    COALESCE(AVG(net_price) FILTER (WHERE status='approved' AND approved_at >= now() - interval '30 days'),0),
    (SELECT COUNT(*)::int FROM public.profiles)
  FROM o;
END; $function$;