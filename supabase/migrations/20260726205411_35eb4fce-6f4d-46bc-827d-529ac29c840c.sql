CREATE OR REPLACE FUNCTION public.also_bought_products(_product_id uuid, _limit integer DEFAULT 6)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  image_url text,
  price_try numeric,
  category text,
  buyers integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (SELECT LEAST(GREATEST(coalesce(_limit, 6), 1), 12) AS n),
  buyers AS (
    SELECT DISTINCT o.user_id
    FROM public.orders o
    WHERE o.product_id = _product_id
      AND o.status = 'approved'
      AND o.user_id IS NOT NULL
  ),
  co AS (
    SELECT o.product_id, count(DISTINCT o.user_id)::int AS cnt
    FROM public.orders o
    JOIN buyers b ON b.user_id = o.user_id
    WHERE o.status = 'approved'
      AND o.product_id IS NOT NULL
      AND o.product_id <> _product_id
    GROUP BY o.product_id
  ),
  fallback AS (
    SELECT p.id AS product_id, 0 AS cnt
    FROM public.products p
    WHERE p.active = true
      AND p.id <> _product_id
      AND p.category IS NOT DISTINCT FROM (SELECT category FROM public.products WHERE id = _product_id)
    ORDER BY coalesce(p.review_count, 0) DESC, p.created_at DESC
    LIMIT 12
  ),
  merged AS (
    SELECT * FROM co
    UNION ALL
    SELECT * FROM fallback WHERE NOT EXISTS (SELECT 1 FROM co)
  )
  SELECT p.id, p.name, p.slug, p.image_url, p.price_try, p.category, m.cnt AS buyers
  FROM merged m
  JOIN public.products p ON p.id = m.product_id AND p.active = true
  ORDER BY m.cnt DESC, p.created_at DESC
  LIMIT (SELECT n FROM lim);
$$;

REVOKE ALL ON FUNCTION public.also_bought_products(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.also_bought_products(uuid, integer) TO anon, authenticated, service_role;