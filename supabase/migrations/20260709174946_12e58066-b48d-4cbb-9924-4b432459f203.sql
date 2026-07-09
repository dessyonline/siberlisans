
-- Change global key uniqueness to per-product uniqueness
-- so the same key text (e.g. shared invite links, email:password pairs) can
-- exist across multiple products without blocking imports.
ALTER TABLE public.license_keys DROP CONSTRAINT IF EXISTS license_keys_key_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS license_keys_product_key_uidx
  ON public.license_keys (product_id, key_value);
