ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_price numeric,
  ADD COLUMN IF NOT EXISTS required_fields jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS products_source_external_uniq
  ON public.products(source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS custom_fields jsonb;