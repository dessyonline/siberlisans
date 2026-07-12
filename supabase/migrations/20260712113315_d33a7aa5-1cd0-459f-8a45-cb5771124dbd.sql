
-- 1) Profile'a fatura alanları
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_tax_id text,
  ADD COLUMN IF NOT EXISTS billing_address text;

-- 2) Fatura numarası sequence
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n bigint;
  _ym text := to_char(now(), 'YYYYMM');
BEGIN
  _n := nextval('public.invoice_number_seq');
  RETURN 'SP-' || _ym || '-' || lpad(_n::text, 6, '0');
END;
$$;

-- 3) Invoices tablosu
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  buyer_name text,
  buyer_email text,
  buyer_tax_id text,
  buyer_address text,
  subtotal_try numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 20.00,
  vat_amount_try numeric(12,2) NOT NULL DEFAULT 0,
  total_try numeric(12,2) NOT NULL DEFAULT 0,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own invoices read" ON public.invoices;
CREATE POLICY "own invoices read" ON public.invoices
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin invoices manage" ON public.invoices;
CREATE POLICY "admin invoices manage" ON public.invoices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_invoices_user ON public.invoices(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON public.invoices(order_id);

-- 4) Fatura üretim fonksiyonu (idempotent: aynı order için 2. fatura üretmez)
CREATE OR REPLACE FUNCTION public.create_invoice_for_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id uuid;
  _order record;
  _profile record;
  _items jsonb;
  _total numeric(12,2);
  _subtotal numeric(12,2);
  _vat numeric(12,2);
  _invoice_id uuid;
  _invoice_number text;
BEGIN
  -- Zaten fatura var mı?
  SELECT id INTO _existing_id FROM public.invoices WHERE order_id = _order_id;
  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  SELECT o.id, o.user_id, o.price_try, o.reference_code, o.status,
         o.buyer_email, o.checkout_fields, o.created_at, o.approved_at,
         p.name as product_name
    INTO _order
    FROM public.orders o
    LEFT JOIN public.products p ON p.id = o.product_id
    WHERE o.id = _order_id;

  IF _order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', _order_id;
  END IF;

  IF _order.status <> 'approved' THEN
    RAISE EXCEPTION 'Order % is not approved (status=%)', _order_id, _order.status;
  END IF;

  SELECT display_name, email, billing_name, billing_tax_id, billing_address
    INTO _profile
    FROM public.profiles WHERE id = _order.user_id;

  -- Items snapshot
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'name', COALESCE(oi.product_name_snapshot, _order.product_name, 'Ürün'),
      'quantity', oi.quantity,
      'unit_price_try', oi.unit_price_try,
      'line_total_try', (oi.unit_price_try * oi.quantity)
    )),
    jsonb_build_array(jsonb_build_object(
      'name', COALESCE(_order.product_name, 'Ürün'),
      'quantity', 1,
      'unit_price_try', _order.price_try,
      'line_total_try', _order.price_try
    ))
  )
    INTO _items
    FROM public.order_items oi WHERE oi.order_id = _order_id;

  _total := _order.price_try;
  -- KDV %20 dahil: matrah = total / 1.20
  _subtotal := round(_total / 1.20, 2);
  _vat := round(_total - _subtotal, 2);

  _invoice_number := public.next_invoice_number();

  INSERT INTO public.invoices(
    order_id, user_id, invoice_number, issued_at,
    buyer_name, buyer_email, buyer_tax_id, buyer_address,
    subtotal_try, vat_rate, vat_amount_try, total_try, items_snapshot
  ) VALUES (
    _order.id, _order.user_id, _invoice_number, COALESCE(_order.approved_at, now()),
    COALESCE(_profile.billing_name, _profile.display_name, 'Bireysel Müşteri'),
    COALESCE(_order.buyer_email, _profile.email),
    _profile.billing_tax_id,
    _profile.billing_address,
    _subtotal, 20.00, _vat, _total, _items
  )
  RETURNING id INTO _invoice_id;

  RETURN _invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_for_order(uuid) TO authenticated, service_role;

-- 5) Trigger: sipariş approved olduğunda fatura oluştur
CREATE OR REPLACE FUNCTION public.trg_orders_create_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    BEGIN
      PERFORM public.create_invoice_for_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- fatura üretilemezse siparişi bloklama
      RAISE NOTICE 'invoice generation failed for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_create_invoice ON public.orders;
CREATE TRIGGER trg_orders_create_invoice
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_create_invoice();

-- Insert trigger de ekleyelim (approved direkt insert edilirse)
CREATE OR REPLACE FUNCTION public.trg_orders_insert_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    BEGIN
      PERFORM public.create_invoice_for_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'invoice generation failed for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_insert_invoice ON public.orders;
CREATE TRIGGER trg_orders_insert_invoice
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_insert_invoice();

-- 6) Back-fill: mevcut approved siparişler için fatura üret
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT o.id FROM public.orders o
    LEFT JOIN public.invoices i ON i.order_id = o.id
    WHERE o.status = 'approved' AND i.id IS NULL
    ORDER BY o.approved_at ASC NULLS LAST, o.created_at ASC
  LOOP
    BEGIN
      PERFORM public.create_invoice_for_order(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'backfill skipped order %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
