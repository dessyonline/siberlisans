-- Lock down orders INSERT to admin/service_role only. Client creation
-- goes through the createOrder server fn which uses supabaseAdmin.
DROP POLICY IF EXISTS "Users create own orders" ON public.orders;

-- Wallet topups: users may edit their pending/reviewing rows, but must not
-- change amount_try, status, user_id, or reference_code after submission.
DROP POLICY IF EXISTS "Users update own pending topups" ON public.wallet_topups;
CREATE POLICY "Users update own pending topups"
ON public.wallet_topups
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND status = ANY (ARRAY['pending'::topup_status, 'reviewing'::topup_status])
)
WITH CHECK (
  user_id = auth.uid()
  AND status = ANY (ARRAY['pending'::topup_status, 'reviewing'::topup_status])
);

-- Trigger to freeze immutable financial fields on user updates
CREATE OR REPLACE FUNCTION public.enforce_wallet_topup_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins/service_role bypass
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
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'status yalnızca yönetici tarafından değiştirilebilir';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_topups_immutable ON public.wallet_topups;
CREATE TRIGGER trg_wallet_topups_immutable
BEFORE UPDATE ON public.wallet_topups
FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_topup_immutable_fields();