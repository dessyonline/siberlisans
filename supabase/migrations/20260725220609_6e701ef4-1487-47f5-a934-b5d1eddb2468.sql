
CREATE OR REPLACE FUNCTION public.enforce_wallet_topup_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.amount_try IS DISTINCT FROM OLD.amount_try THEN
    RAISE EXCEPTION 'amount_try değiştirilemez';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id değiştirilemez';
  END IF;
  IF NEW.reference_code IS DISTINCT FROM OLD.reference_code THEN
    RAISE EXCEPTION 'reference_code değiştirilemez';
  END IF;
  -- Sahibi yalnızca pending -> reviewing geçişine izin verilir (dekont yükleme).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'pending'::topup_status AND NEW.status = 'reviewing'::topup_status) THEN
      RAISE EXCEPTION 'status yalnızca yönetici tarafından değiştirilebilir';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_topup_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner boolean := (auth.uid() IS NOT NULL AND auth.uid() = OLD.user_id);
  v_is_admin boolean := (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'));
BEGIN
  IF auth.uid() IS NULL OR v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_is_owner THEN
    -- Sahibi yalnızca pending -> reviewing geçişini yapabilir (dekont yükleme sırasında).
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'pending'::topup_status AND NEW.status = 'reviewing'::topup_status) THEN
        RAISE EXCEPTION 'Yükleme durumunu değiştiremezsiniz';
      END IF;
    END IF;
    IF NEW.amount_try IS DISTINCT FROM OLD.amount_try
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
    THEN
      RAISE EXCEPTION 'Bu alanları değiştirme yetkiniz yok';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Yetkisiz';
END;
$function$;
