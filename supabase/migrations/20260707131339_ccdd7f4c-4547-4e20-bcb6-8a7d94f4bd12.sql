ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS image_url text;
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);