CREATE OR REPLACE FUNCTION public.enforce_wallet_topup_spam_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_topups wt
    WHERE wt.user_id = NEW.user_id
      AND wt.status = ANY (ARRAY['pending'::public.topup_status, 'reviewing'::public.topup_status])
      AND wt.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'aktif_yukleme_talebi_var';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_topups wt
    WHERE wt.user_id = NEW.user_id
      AND wt.created_at > now() - interval '10 minutes'
      AND wt.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'cok_sik_yukleme_talebi';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_topup_spam_guard ON public.wallet_topups;
CREATE TRIGGER trg_wallet_topup_spam_guard
BEFORE INSERT ON public.wallet_topups
FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_topup_spam_guard();