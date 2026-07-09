ALTER TABLE public.order_keys DROP CONSTRAINT IF EXISTS order_keys_license_key_id_fkey;
ALTER TABLE public.order_keys ALTER COLUMN license_key_id DROP NOT NULL;
ALTER TABLE public.order_keys ADD CONSTRAINT order_keys_license_key_id_fkey FOREIGN KEY (license_key_id) REFERENCES public.license_keys(id) ON DELETE SET NULL;