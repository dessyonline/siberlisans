ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard';
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_tier_check;
ALTER TABLE public.products ADD CONSTRAINT products_tier_check CHECK (tier IN ('standard','epic'));
CREATE INDEX IF NOT EXISTS products_sort_order_idx ON public.products (sort_order DESC, created_at DESC);