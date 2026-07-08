
CREATE OR REPLACE FUNCTION public.admin_force_delete_license(_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  DELETE FROM public.order_keys WHERE license_key_id = _id;
  DELETE FROM public.license_keys WHERE id = _id;
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.admin_force_delete_license(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_license(UUID) TO authenticated;
