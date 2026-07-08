UPDATE public.products
SET image_url = NULL
WHERE image_url IS NOT NULL
  AND image_url NOT LIKE '/covers/%'
  AND image_url NOT LIKE '/products/%';