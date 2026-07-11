ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS retail_price_try numeric,
  ADD COLUMN IF NOT EXISTS retail_price_source_url text,
  ADD COLUMN IF NOT EXISTS retail_price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_label text;

COMMENT ON COLUMN public.products.retail_price_try IS 'Resmi satıcının kendi sitesindeki orijinal TL fiyatı (indirim karşılaştırması için).';
COMMENT ON COLUMN public.products.duration_label IS 'Lisans süresi etiketi: "1 yıl", "ömür boyu", "6 ay" vb.';