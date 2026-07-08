ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_fields jsonb,
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS external_delivery_data text,
  ADD COLUMN IF NOT EXISTS external_status text;