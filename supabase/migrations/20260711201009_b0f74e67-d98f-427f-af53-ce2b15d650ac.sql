
CREATE OR REPLACE FUNCTION public.get_partner_by_code(_code text)
RETURNS TABLE(display_name text, referral_code text, partner_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.display_name, p.referral_code, p.partner_slug
  FROM public.profiles p
  WHERE p.referral_code = upper(_code) OR p.partner_slug = lower(_code)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_by_code(text) TO anon, authenticated;
