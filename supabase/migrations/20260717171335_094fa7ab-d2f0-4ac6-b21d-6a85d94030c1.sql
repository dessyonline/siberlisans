
ALTER TABLE public.license_keys ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS public.license_keys_product_key_uidx;

CREATE UNIQUE INDEX license_keys_product_key_uidx
  ON public.license_keys (product_id, key_value)
  WHERE is_shared IS NOT TRUE;
