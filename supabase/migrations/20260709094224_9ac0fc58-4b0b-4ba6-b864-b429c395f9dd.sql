-- 1) PK'yi order_id'den ayır — birden fazla indirim satırı için
ALTER TABLE public.order_discounts DROP CONSTRAINT IF EXISTS order_discounts_pkey;
ALTER TABLE public.order_discounts ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.order_discounts ADD CONSTRAINT order_discounts_pkey PRIMARY KEY (id);

-- 2) promo_code_id opsiyonel
ALTER TABLE public.order_discounts ALTER COLUMN promo_code_id DROP NOT NULL;

-- 3) Kullanıcı kendi siparişine indirim ekleyip silebilsin
DROP POLICY IF EXISTS "Users insert own order discounts" ON public.order_discounts;
CREATE POLICY "Users insert own order discounts" ON public.order_discounts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_discounts.order_id AND o.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Users delete own order discounts" ON public.order_discounts;
CREATE POLICY "Users delete own order discounts" ON public.order_discounts
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_discounts.order_id AND o.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

GRANT SELECT, INSERT, DELETE ON public.order_discounts TO authenticated;
GRANT ALL ON public.order_discounts TO service_role;

-- 4) Mevcut aktif flash indirimleri, hala pending olan siparişlere geriye dönük uygula
INSERT INTO public.order_discounts (order_id, code_snapshot, discount_try)
SELECT DISTINCT ON (o.id)
  o.id,
  'FLASH-' || SUBSTRING(fs.id::text, 1, 8),
  ROUND(LEAST(o.price_try,
    CASE WHEN fs.discount_type = 'percent' THEN o.price_try * fs.discount_value / 100.0
         ELSE fs.discount_value END)::numeric, 2)
FROM public.orders o
JOIN public.flash_sales fs ON fs.product_id = o.product_id
  AND fs.is_active = TRUE
  AND fs.starts_at <= NOW()
  AND fs.ends_at > NOW()
WHERE o.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.order_discounts od
    WHERE od.order_id = o.id AND od.code_snapshot LIKE 'FLASH-%'
  );