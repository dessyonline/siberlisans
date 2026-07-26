-- 1) Manuel teslim
CREATE OR REPLACE FUNCTION public.admin_manual_deliver(
  _order_id uuid,
  _payload text,
  _note text DEFAULT NULL,
  _duration_days int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid; v_status text; v_product uuid; v_pname text; v_key uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF _payload IS NULL OR length(btrim(_payload)) = 0 THEN RAISE EXCEPTION 'Teslim içeriği boş olamaz'; END IF;

  SELECT o.user_id, o.status::text, o.product_id, p.name
    INTO v_owner, v_status, v_product, v_pname
    FROM public.orders o LEFT JOIN public.products p ON p.id = o.product_id
   WHERE o.id = _order_id FOR UPDATE OF o;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'İptal/red edilmiş siparişe teslim yapılamaz'; END IF;

  INSERT INTO public.license_keys(product_id, key_value, status, assigned_order_id, assigned_at, duration_days, expires_at)
  VALUES (
    v_product, btrim(_payload), 'assigned', _order_id, now(), _duration_days,
    CASE WHEN _duration_days IS NULL THEN NULL ELSE now() + make_interval(days => _duration_days) END
  )
  RETURNING id INTO v_key;

  INSERT INTO public.order_keys(order_id, license_key_id, delivered_at)
  VALUES (_order_id, v_key, now());

  UPDATE public.orders
     SET status = 'approved',
         approved_at = COALESCE(approved_at, now()),
         admin_note = COALESCE(_note, admin_note),
         updated_at = now()
   WHERE id = _order_id;

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_owner, 'order', 'Siparişin teslim edildi',
          COALESCE(v_pname,'Ürün') || ' teslim edildi. Lisanslarım sayfasından görebilirsin.',
          '/hesabim/lisanslar');

  PERFORM public.log_admin_action('order.manual_deliver','order', _order_id::text, NULL,
    jsonb_build_object('duration_days', _duration_days), jsonb_build_object('note', _note));

  RETURN jsonb_build_object('ok', true, 'license_key_id', v_key);
END; $$;

-- 2) Kısmi iade
CREATE OR REPLACE FUNCTION public.admin_partial_refund(
  _order_id uuid,
  _amount numeric,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid; v_price numeric; v_discount numeric := 0; v_final numeric;
  v_refunded numeric := 0; v_balance numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Geçersiz tutar'; END IF;

  SELECT user_id, price_try INTO v_owner, v_price
    FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_discount
    FROM public.order_discounts WHERE order_id = _order_id;
  v_final := GREATEST(0, COALESCE(v_price,0) - v_discount);

  SELECT COALESCE(SUM(amount_try),0) INTO v_refunded
    FROM public.wallet_transactions WHERE order_id = _order_id AND kind = 'refund';

  IF v_refunded + _amount > v_final THEN
    RAISE EXCEPTION 'İade toplamı sipariş tutarını aşamaz (kalan: %)', (v_final - v_refunded);
  END IF;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_owner, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + _amount, updated_at = now()
    WHERE user_id = v_owner RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
  VALUES (v_owner, 'refund', _amount, v_balance, _order_id, COALESCE(_note,'Kısmi iade'), auth.uid());

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_owner, 'wallet', 'Kısmi iade yapıldı',
          '₺' || trim(to_char(_amount,'FM999999990.00')) || ' cüzdanına iade edildi.', '/cuzdan');

  PERFORM public.log_admin_action('order.partial_refund','order', _order_id::text, NULL,
    jsonb_build_object('amount_try', _amount), jsonb_build_object('note', _note));

  RETURN jsonb_build_object('ok', true, 'refunded_try', _amount, 'balance_after', v_balance,
                            'remaining_refundable', v_final - v_refunded - _amount);
END; $$;

-- 3) Sipariş ürününü değiştir
CREATE OR REPLACE FUNCTION public.admin_change_order_product(
  _order_id uuid,
  _product_id uuid,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid; v_old_product uuid; v_old_price numeric; v_paid text;
  v_new_price numeric; v_new_name text; v_diff numeric; v_balance numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;

  SELECT user_id, product_id, price_try, paid_with
    INTO v_owner, v_old_product, v_old_price, v_paid
    FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_old_product = _product_id THEN RAISE EXCEPTION 'Sipariş zaten bu üründe'; END IF;

  SELECT price_try, name INTO v_new_price, v_new_name FROM public.products WHERE id = _product_id;
  IF v_new_price IS NULL THEN RAISE EXCEPTION 'Ürün bulunamadı'; END IF;

  v_diff := COALESCE(v_old_price,0) - v_new_price;

  UPDATE public.orders
     SET product_id = _product_id,
         price_try = v_new_price,
         admin_note = COALESCE(_note, admin_note),
         updated_at = now()
   WHERE id = _order_id;

  IF v_paid = 'wallet' AND v_diff <> 0 THEN
    INSERT INTO public.wallets(user_id, balance_try) VALUES (v_owner, 0)
    ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.wallets SET balance_try = balance_try + v_diff, updated_at = now()
      WHERE user_id = v_owner RETURNING balance_try INTO v_balance;
    INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
    VALUES (v_owner, CASE WHEN v_diff > 0 THEN 'refund' ELSE 'purchase' END,
            abs(v_diff), v_balance, _order_id, 'Sipariş ürün değişimi farkı', auth.uid());
  END IF;

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_owner, 'order', 'Siparişin güncellendi',
          'Siparişin "' || v_new_name || '" ürününe taşındı.', '/hesabim');

  PERFORM public.log_admin_action('order.change_product','order', _order_id::text,
    jsonb_build_object('product_id', v_old_product, 'price_try', v_old_price),
    jsonb_build_object('product_id', _product_id, 'price_try', v_new_price),
    jsonb_build_object('note', _note, 'wallet_delta', CASE WHEN v_paid='wallet' THEN v_diff ELSE 0 END));

  RETURN jsonb_build_object('ok', true, 'wallet_delta', CASE WHEN v_paid='wallet' THEN v_diff ELSE 0 END);
END; $$;

-- 4) Siparişler için canlı yayın
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER TABLE public.orders REPLICA IDENTITY FULL;