-- 1) Fiyat düşünce favori sahiplerine bildirim
CREATE OR REPLACE FUNCTION public.notify_price_drop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_drop NUMERIC;
  r RECORD;
BEGIN
  IF NEW.price_try IS NULL OR OLD.price_try IS NULL OR OLD.price_try <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.price_try >= OLD.price_try OR NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  v_drop := ROUND((OLD.price_try - NEW.price_try) * 100.0 / OLD.price_try);
  IF v_drop < 5 THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT f.user_id FROM public.favorites f WHERE f.product_id = NEW.id
  LOOP
    PERFORM public.push_notification(
      r.user_id,
      'price_drop',
      'Favorindeki ürün ucuzladı: ' || NEW.name,
      '%' || v_drop::TEXT || ' indirim — ' || TRIM(TO_CHAR(NEW.price_try, 'FM999999990.00')) || ' TL',
      '/urun/' || NEW.slug
    );
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_price_drop ON public.products;
CREATE TRIGGER trg_notify_price_drop
AFTER UPDATE OF price_try ON public.products
FOR EACH ROW EXECUTE FUNCTION public.notify_price_drop();

-- 2) Segment bazlı kişisel kupon kampanyası
CREATE OR REPLACE FUNCTION public.admin_issue_segment_coupons(
  _segment TEXT,
  _discount_type TEXT,
  _discount_value NUMERIC,
  _min_order_try NUMERIC DEFAULT 0,
  _days_valid INT DEFAULT 7,
  _limit INT DEFAULT 200
) RETURNS TABLE(issued INT, sample_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_count INT := 0;
  v_sample TEXT;
  v_expires TIMESTAMPTZ := now() + make_interval(days => GREATEST(_days_valid, 1));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  IF _discount_type NOT IN ('percent','amount') THEN
    RAISE EXCEPTION 'Gecersiz indirim tipi';
  END IF;
  IF _discount_value <= 0 THEN
    RAISE EXCEPTION 'Gecersiz indirim degeri';
  END IF;

  FOR r IN
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE CASE
      WHEN _segment = 'no_purchase' THEN NOT EXISTS (
        SELECT 1 FROM public.orders o WHERE o.user_id = p.id AND o.status = 'approved')
      WHEN _segment = 'returning' THEN EXISTS (
        SELECT 1 FROM public.orders o WHERE o.user_id = p.id AND o.status = 'approved')
      WHEN _segment = 'inactive_30' THEN EXISTS (
        SELECT 1 FROM public.orders o WHERE o.user_id = p.id AND o.status = 'approved')
        AND NOT EXISTS (
        SELECT 1 FROM public.orders o WHERE o.user_id = p.id AND o.status = 'approved'
          AND o.created_at > now() - INTERVAL '30 days')
      ELSE FALSE
    END
    AND NOT EXISTS (
      SELECT 1 FROM public.coupons c
      WHERE c.user_id = p.id AND c.is_personal AND c.is_active
        AND (c.expires_at IS NULL OR c.expires_at > now())
        AND c.used_count = 0
    )
    ORDER BY p.created_at DESC
    LIMIT GREATEST(_limit, 1)
  LOOP
    v_code := 'CMP' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));
    INSERT INTO public.coupons(code, discount_type, discount_value, min_order_try,
      max_uses, expires_at, is_active, user_id, is_personal)
    VALUES (v_code, _discount_type, _discount_value, COALESCE(_min_order_try, 0),
      1, v_expires, TRUE, r.user_id, TRUE);

    PERFORM public.push_notification(
      r.user_id,
      'coupon',
      'Sana özel indirim kuponu',
      CASE WHEN _discount_type = 'percent'
        THEN '%' || TRIM(TO_CHAR(_discount_value, 'FM999990.##')) || ' indirim · kod: ' || v_code
        ELSE TRIM(TO_CHAR(_discount_value, 'FM999990.00')) || ' TL indirim · kod: ' || v_code END,
      '/urunler'
    );

    v_count := v_count + 1;
    IF v_sample IS NULL THEN v_sample := v_code; END IF;
  END LOOP;

  RETURN QUERY SELECT v_count, v_sample;
END; $$;

REVOKE ALL ON FUNCTION public.admin_issue_segment_coupons(TEXT,TEXT,NUMERIC,NUMERIC,INT,INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_issue_segment_coupons(TEXT,TEXT,NUMERIC,NUMERIC,INT,INT) TO authenticated;