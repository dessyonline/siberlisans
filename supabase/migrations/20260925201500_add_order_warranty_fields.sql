-- Ürün bazlı opsiyonel garanti ve sipariş anındaki garanti anlık görüntüsü.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS warranty_price_try numeric(12,2),
  ADD COLUMN IF NOT EXISTS warranty_label text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS warranty boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warranty_price_try numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warranty_label text;
