
CREATE OR REPLACE FUNCTION public.prevent_order_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin veya server-side (auth yok) ise izin ver
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.price_try IS DISTINCT FROM OLD.price_try
     OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Bu alanları değiştirme yetkiniz yok';
  END IF;
  RETURN NEW;
END;
$$;

-- Şimdi temizliği yeniden çalıştır
DO $$
DECLARE
  LOVABLE_ID CONSTANT UUID := '4f6d86cf-6a89-4940-90af-953cc3d6ab5f';
  bad_key RECORD;
BEGIN
  FOR bad_key IN
    SELECT lk.id AS key_id, lk.assigned_order_id
    FROM public.license_keys lk
    WHERE lk.product_id <> LOVABLE_ID
      AND lk.key_value LIKE 'SIBER-%'
  LOOP
    DELETE FROM public.order_keys WHERE license_key_id = bad_key.key_id;
    IF bad_key.assigned_order_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.order_keys ok WHERE ok.order_id = bad_key.assigned_order_id
      ) THEN
        UPDATE public.orders
          SET status = 'pending', approved_at = NULL
          WHERE id = bad_key.assigned_order_id;
      END IF;
    END IF;
    DELETE FROM public.license_keys WHERE id = bad_key.key_id;
  END LOOP;
END $$;
