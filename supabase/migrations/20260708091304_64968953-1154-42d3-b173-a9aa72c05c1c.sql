
-- 1) Add new duration options
ALTER TYPE public.duration_type ADD VALUE IF NOT EXISTS 'hourly';
ALTER TYPE public.duration_type ADD VALUE IF NOT EXISTS 'daily';
ALTER TYPE public.duration_type ADD VALUE IF NOT EXISTS 'weekly';

-- 2) Loosen the trigger: allow order owner to transition pending -> reviewing (receipt upload)
CREATE OR REPLACE FUNCTION public.prevent_order_sensitive_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner boolean := (auth.uid() IS NOT NULL AND auth.uid() = OLD.user_id);
  v_is_admin boolean := (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'));
BEGIN
  -- Server-side (no auth) or admin: full access
  IF auth.uid() IS NULL OR v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Owner: allow uploading receipt (pending -> reviewing) and editing own note
  IF v_is_owner THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'pending' AND NEW.status = 'reviewing') THEN
        RAISE EXCEPTION 'Bu aşamada durumu değiştiremezsiniz';
      END IF;
    END IF;
    IF NEW.price_try IS DISTINCT FROM OLD.price_try
       OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Bu alanları değiştirme yetkiniz yok';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Yetkisiz';
END;
$function$;
