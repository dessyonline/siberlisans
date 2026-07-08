-- Fix mutable search_path on compute_tier
CREATE OR REPLACE FUNCTION public.compute_tier(_points integer)
RETURNS public.user_tier
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN _points >= 5000 THEN 'platinum'::public.user_tier
    WHEN _points >= 2000 THEN 'gold'::public.user_tier
    WHEN _points >= 500  THEN 'silver'::public.user_tier
    ELSE 'bronze'::public.user_tier
  END;
$function$;

-- Restrict bank_accounts read to authenticated users (checkout requires login)
DROP POLICY IF EXISTS "Anyone reads active bank" ON public.bank_accounts;
CREATE POLICY "Authenticated reads active bank"
ON public.bank_accounts
FOR SELECT
TO authenticated
USING ((active = true) OR has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.bank_accounts FROM anon;