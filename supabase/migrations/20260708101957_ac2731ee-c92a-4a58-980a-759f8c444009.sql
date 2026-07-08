CREATE OR REPLACE FUNCTION public.gen_random_bytes(len integer)
 RETURNS bytea
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO extensions
AS $function$
  SELECT extensions.gen_random_bytes(len);
$function$;

GRANT EXECUTE ON FUNCTION public.gen_random_bytes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_random_bytes(integer) TO service_role;