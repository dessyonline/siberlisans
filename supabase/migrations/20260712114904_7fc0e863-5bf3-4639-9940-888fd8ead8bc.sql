CREATE OR REPLACE FUNCTION public.public_recent_sales()
RETURNS TABLE(name text, category text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.name, p.category, o.created_at
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.status = 'approved'
  ORDER BY o.created_at DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.public_recent_sales() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_recent_sales() TO anon, authenticated;