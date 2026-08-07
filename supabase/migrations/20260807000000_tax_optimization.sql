-- 1) Fatura (invoices) tablosuna KDV detayları için sütunlar ekle
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 20,
ADD COLUMN IF NOT EXISTS subtotal_try numeric,
ADD COLUMN IF NOT EXISTS is_tax_exempt boolean DEFAULT false;

-- 2) Mevcut faturaları güncelle (geçmiş veriler için matrah hesapla)
UPDATE public.invoices 
SET vat_rate = 20,
    subtotal_try = total_try / 1.2,
    vat_amount_try = total_try - (total_try / 1.2)
WHERE subtotal_try IS NULL;

-- 3) Shopier onay fonksiyonunu vergi optimizasyonu (matrah ayırma) ile güncelle
CREATE OR REPLACE FUNCTION public.approve_shopier_order(
  _shopier_order_id text,
  _buyer_email text,
  _amount numeric
) RETURNS TABLE(order_id uuid, matched boolean, already boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_order_id uuid;
  v_status public.order_status;
  v_final numeric;
  v_subtotal numeric;
  v_vat numeric;
BEGIN
  -- Idempotency check
  SELECT o.id, o.status INTO v_order_id, v_status
  FROM public.orders o WHERE o.shopier_order_id = _shopier_order_id LIMIT 1;
  IF v_order_id IS NOT NULL THEN
    order_id := v_order_id; matched := true; already := true; RETURN NEXT; RETURN;
  END IF;

  SELECT p.id INTO v_uid FROM public.profiles p WHERE lower(p.email) = lower(_buyer_email) LIMIT 1;
  IF v_uid IS NULL THEN
    order_id := NULL; matched := false; already := false; RETURN NEXT; RETURN;
  END IF;

  FOR v_order_id, v_final IN
    SELECT o.id,
           GREATEST(0, o.price_try - COALESCE((SELECT SUM(discount_try) FROM public.order_discounts WHERE order_id = o.id),0))
    FROM public.orders o
    WHERE o.user_id = v_uid
      AND o.status IN ('pending','reviewing')
      AND o.created_at > now() - interval '24 hours'
    ORDER BY o.created_at DESC
  LOOP
    IF ABS(v_final - _amount) < 0.05 THEN
      UPDATE public.orders
        SET status = 'approved', approved_at = now(),
            paid_with = 'shopier', shopier_order_id = _shopier_order_id, updated_at = now()
        WHERE id = v_order_id;
      
      -- Fatura oluşturulurken vergi optimizasyonu yap (20% KDV dahil varsayılan)
      v_subtotal := v_final / 1.2;
      v_vat := v_final - v_subtotal;
      
      -- Sipariş onaylandığında faturayı da buraya (veya tetikleyiciye) bağla
      -- Not: Mevcut sistemde faturayı otomatik üreten bir tetikleyici olabilir, garantilemek için rpc'de de yapıyoruz.
      INSERT INTO public.invoices (order_id, total_try, vat_amount_try, subtotal_try, vat_rate, invoice_number)
      VALUES (v_order_id, v_final, v_vat, v_subtotal, 20, 'SP-' || to_char(now(), 'YYYYMM') || '-' || LPAD(floor(random()*999999)::text, 6, '0'))
      ON CONFLICT DO NOTHING;

      PERFORM public._assign_key_to_order(v_order_id);
      order_id := v_order_id; matched := true; already := false; RETURN NEXT; RETURN;
    END IF;
  END LOOP;

  order_id := NULL; matched := false; already := false; RETURN NEXT;
END; $$;

-- 4) Yetkileri yenile
GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
