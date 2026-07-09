-- 1) Orders: extend guard to cover more sensitive fields
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
  IF auth.uid() IS NULL OR v_is_admin THEN
    RETURN NEW;
  END IF;

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
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.external_status IS DISTINCT FROM OLD.external_status
       OR NEW.referral_commission_paid IS DISTINCT FROM OLD.referral_commission_paid
       OR NEW.shopier_order_id IS DISTINCT FROM OLD.shopier_order_id
       OR NEW.paid_with IS DISTINCT FROM OLD.paid_with
       OR NEW.abandonment_notified_at IS DISTINCT FROM OLD.abandonment_notified_at
       OR NEW.item_count IS DISTINCT FROM OLD.item_count
       OR NEW.reference_code IS DISTINCT FROM OLD.reference_code
    THEN
      RAISE EXCEPTION 'Bu alanları değiştirme yetkiniz yok';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Yetkisiz';
END;
$function$;

-- 2) Wallet topups: prevent users from changing status/amount/approved_at
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
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Yükleme durumunu değiştiremezsiniz';
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

DROP TRIGGER IF EXISTS trg_prevent_topup_sensitive_update ON public.wallet_topups;
CREATE TRIGGER trg_prevent_topup_sensitive_update
  BEFORE UPDATE ON public.wallet_topups
  FOR EACH ROW EXECUTE FUNCTION public.prevent_topup_sensitive_update();