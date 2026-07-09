DROP POLICY IF EXISTS reviews_public_read ON public.product_reviews;

CREATE POLICY reviews_owner_read ON public.product_reviews
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.list_product_reviews(_product_id uuid)
RETURNS TABLE (
  id uuid,
  masked_user text,
  is_mine boolean,
  rating int,
  comment text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    substr(md5(r.user_id::text), 1, 8) AS masked_user,
    (auth.uid() IS NOT NULL AND auth.uid() = r.user_id) AS is_mine,
    r.rating,
    r.comment,
    r.created_at
  FROM public.product_reviews r
  WHERE r.product_id = _product_id
  ORDER BY r.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.list_product_reviews(uuid) TO anon, authenticated;