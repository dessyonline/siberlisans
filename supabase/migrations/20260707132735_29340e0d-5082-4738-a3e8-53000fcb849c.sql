ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS manual_fulfillment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_hint integer;