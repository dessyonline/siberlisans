INSERT INTO public.order_discounts (order_id, product_id, code_snapshot, discount_try)
SELECT
  o.id,
  target_item.product_id,
  COALESCE(NULLIF(csr.promo_code, ''), 'KOMBO-' || SUBSTRING(csr.id::text, 1, 8)),
  ROUND((target_item.unit_price_try * target_item.quantity * (csr.discount_percent / 100.0))::numeric, 2)
FROM public.orders o
JOIN public.order_items target_item ON target_item.order_id = o.id
JOIN public.products target_product ON target_product.id = target_item.product_id
JOIN public.cross_sell_rules csr ON csr.active = TRUE AND csr.to_category = target_product.category
WHERE o.status = 'pending'
  AND csr.discount_percent > 0
  AND EXISTS (
    SELECT 1
    FROM public.order_items source_item
    JOIN public.products source_product ON source_product.id = source_item.product_id
    WHERE source_item.order_id = o.id
      AND source_item.product_id <> target_item.product_id
      AND source_product.category = csr.from_category
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_discounts od
    WHERE od.order_id = o.id
      AND od.product_id = target_item.product_id
      AND od.code_snapshot = COALESCE(NULLIF(csr.promo_code, ''), 'KOMBO-' || SUBSTRING(csr.id::text, 1, 8))
  )
  AND ROUND((target_item.unit_price_try * target_item.quantity * (csr.discount_percent / 100.0))::numeric, 2) > 0;