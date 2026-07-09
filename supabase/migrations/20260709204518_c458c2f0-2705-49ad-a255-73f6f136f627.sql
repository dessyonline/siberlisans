-- Lisans yenileme hatırlatıcı sistemi
-- Süresi bitmek üzere olan lisanslara panel bildirimi + tek kullanımlık %10 kupon

CREATE OR REPLACE FUNCTION public.send_license_renewal_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_coupon_code text;
  v_days_left int;
  v_already_notified boolean;
BEGIN
  FOR r IN
    SELECT
      lk.id AS lk_id,
      lk.expires_at,
      lk.product_id,
      p.name AS product_name,
      p.slug AS product_slug,
      o.user_id,
      EXTRACT(day FROM (lk.expires_at - now()))::int AS days_left
    FROM public.license_keys lk
    JOIN public.order_keys ok ON ok.license_key_id = lk.id
    JOIN public.orders o ON o.id = ok.order_id
    JOIN public.products p ON p.id = lk.product_id
    WHERE lk.expires_at IS NOT NULL
      AND lk.revoked = false
      AND o.status = 'approved'
      AND o.user_id IS NOT NULL
      AND lk.expires_at > now()
      AND lk.expires_at <= now() + interval '3 days'
  LOOP
    v_days_left := GREATEST(r.days_left, 0);

    -- Aynı lisans için son 20 saat içinde bildirim gitmiş mi?
    SELECT EXISTS(
      SELECT 1 FROM public.notifications
      WHERE user_id = r.user_id
        AND type = 'renewal'
        AND link LIKE '%' || r.lk_id::text || '%'
        AND created_at > now() - interval '20 hours'
    ) INTO v_already_notified;

    IF v_already_notified THEN
      CONTINUE;
    END IF;

    -- Tek kullanımlık %10 kupon üret (7 gün geçerli)
    v_coupon_code := 'YENILE-' || upper(substring(md5(random()::text || r.lk_id::text) from 1 for 8));

    INSERT INTO public.coupons(code, discount_type, discount_value, min_order_try, max_uses, expires_at, is_active)
    VALUES (v_coupon_code, 'percent', 10, 0, 1, now() + interval '7 days', true)
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (
      r.user_id,
      'renewal',
      r.product_name || ' lisansın ' || v_days_left || ' gün içinde bitiyor',
      'Yenilemek için ' || v_coupon_code || ' kuponuyla %10 indirim kazandın. 7 gün geçerli.',
      '/urun/' || r.product_slug || '?coupon=' || v_coupon_code || '&ref=' || r.lk_id
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.send_license_renewal_reminders() FROM PUBLIC;

-- pg_cron: her gün 10:00 (Europe/Istanbul UTC+3) → 07:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('license-renewal-reminders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'license-renewal-reminders');
    PERFORM cron.schedule(
      'license-renewal-reminders',
      '0 7 * * *',
      $CRON$SELECT public.send_license_renewal_reminders();$CRON$
    );
  END IF;
END $$;
