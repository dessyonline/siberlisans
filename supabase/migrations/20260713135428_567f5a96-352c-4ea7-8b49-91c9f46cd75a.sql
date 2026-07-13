-- Remove broad referrer SELECT policy that exposed PII
DROP POLICY IF EXISTS "Referrer can read invited profiles" ON public.profiles;

-- Secure RPC returning only non-sensitive fields for the caller's invitees
CREATE OR REPLACE FUNCTION public.list_my_referred()
RETURNS TABLE (
  id uuid,
  display_name text,
  masked_email text,
  created_at timestamptz,
  referral_bonus_paid boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    CASE
      WHEN p.email IS NULL OR position('@' in p.email) = 0 THEN NULL
      ELSE
        substr(split_part(p.email, '@', 1), 1, 2)
        || repeat('*', GREATEST(length(split_part(p.email, '@', 1)) - 2, 1))
        || '@' || split_part(p.email, '@', 2)
    END AS masked_email,
    p.created_at,
    COALESCE(p.referral_bonus_paid, false)
  FROM public.profiles p
  WHERE p.referred_by = auth.uid()
  ORDER BY p.created_at DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.list_my_referred() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_referred() TO authenticated;