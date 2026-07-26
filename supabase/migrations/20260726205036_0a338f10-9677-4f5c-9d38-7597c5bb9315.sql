
CREATE OR REPLACE FUNCTION public.recent_public_sales(_limit int DEFAULT 8)
RETURNS TABLE(id uuid, product_name text, product_slug text, image_url text, masked_buyer text, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.id,
    p.name,
    p.slug,
    p.image_url,
    upper(substr(coalesce(pr.display_name, 'siber'), 1, 1)) || '***' AS masked_buyer,
    o.approved_at
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  LEFT JOIN public.profiles pr ON pr.id = o.user_id
  WHERE o.status = 'approved'
    AND o.approved_at IS NOT NULL
    AND o.approved_at > now() - interval '30 days'
    AND p.active = true
  ORDER BY o.approved_at DESC
  LIMIT LEAST(GREATEST(coalesce(_limit, 8), 1), 20)
$$;

GRANT EXECUTE ON FUNCTION public.recent_public_sales(int) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pending_review_products()
RETURNS TABLE(product_id uuid, name text, slug text, image_url text, purchased_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (p.id)
    p.id, p.name, p.slug, p.image_url, o.approved_at
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  JOIN public.products p ON p.id = COALESCE(oi.product_id, o.product_id)
  WHERE auth.uid() IS NOT NULL
    AND o.user_id = auth.uid()
    AND o.status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.product_reviews r
      WHERE r.product_id = p.id AND r.user_id = auth.uid()
    )
  ORDER BY p.id, o.approved_at DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.pending_review_products() TO authenticated, service_role;
