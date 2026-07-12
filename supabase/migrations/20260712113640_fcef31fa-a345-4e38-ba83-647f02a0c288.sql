
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
  _buyer_email text;
BEGIN
  SELECT id INTO _existing_id FROM public.invoices WHERE order_id = _order_id;
  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  SELECT o.id, o.user_id, o.price_try, o.reference_code, o.status,
         o.checkout_fields, o.created_at, o.approved_at,
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

  -- buyer_email: önce checkout_fields->>'buyer_email' / 'email', yoksa profil emaili
  _buyer_email := COALESCE(
    _order.checkout_fields->>'buyer_email',
    _order.checkout_fields->>'email',
    _profile.email
  );

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
    _buyer_email,
    _profile.billing_tax_id,
    _profile.billing_address,
    _subtotal, 20.00, _vat, _total, _items
  )
  RETURNING id INTO _invoice_id;

  RETURN _invoice_id;
END;
$$;

-- Back-fill retry
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
