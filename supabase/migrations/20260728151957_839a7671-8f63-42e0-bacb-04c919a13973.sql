CREATE TABLE public.dealer_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'API anahtarı',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  call_count bigint NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dealer_api_keys TO authenticated;
GRANT ALL ON public.dealer_api_keys TO service_role;
ALTER TABLE public.dealer_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dak_own_read" ON public.dealer_api_keys FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_dak_user ON public.dealer_api_keys(user_id);

-- ---- panel: anahtar üret / iptal ----
CREATE OR REPLACE FUNCTION public.dealer_issue_api_key(_label text DEFAULT 'API anahtarı')
RETURNS TABLE(id uuid, api_key text, key_prefix text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_key text; v_id uuid; v_cnt int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum yok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dealers WHERE user_id = v_uid AND active = true) THEN
    RAISE EXCEPTION 'Bayi değilsiniz';
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM public.dealer_api_keys WHERE user_id = v_uid AND revoked = false;
  IF v_cnt >= 5 THEN RAISE EXCEPTION 'En fazla 5 aktif anahtar oluşturabilirsiniz'; END IF;

  v_key := 'sbr_live_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.dealer_api_keys(user_id, label, key_hash, key_prefix)
  VALUES (v_uid, COALESCE(NULLIF(btrim(_label), ''), 'API anahtarı'),
          encode(digest(v_key, 'sha256'), 'hex'), left(v_key, 17))
  RETURNING dealer_api_keys.id INTO v_id;

  RETURN QUERY SELECT v_id, v_key, left(v_key, 17);
END; $$;

CREATE OR REPLACE FUNCTION public.dealer_revoke_api_key(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.dealer_api_keys SET revoked = true
  WHERE id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Anahtar bulunamadı'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.dealer_issue_api_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dealer_revoke_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dealer_issue_api_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dealer_revoke_api_key(uuid) TO authenticated;

-- ---- api: kimlik doğrulama ----
CREATE OR REPLACE FUNCTION public.api_dealer_auth(_api_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid;
BEGIN
  UPDATE public.dealer_api_keys k
    SET last_used_at = now(), call_count = k.call_count + 1
  WHERE k.key_hash = encode(digest(COALESCE(_api_key, ''), 'sha256'), 'hex')
    AND k.revoked = false
  RETURNING k.user_id INTO v_uid;
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dealers WHERE user_id = v_uid AND active = true) THEN
    RETURN NULL;
  END IF;
  RETURN v_uid;
END; $$;

-- ---- api: fiyat listesi ----
CREATE OR REPLACE FUNCTION public.api_dealer_price_list(_user_id uuid)
RETURNS TABLE(id uuid, name text, slug text, category text, price_try numeric,
              dealer_price_try numeric, available integer, unlimited_stock boolean, manual boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_disc numeric(5,2);
BEGIN
  SELECT COALESCE(d.discount_percent, t.discount_percent) INTO v_disc
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = _user_id AND d.active = true;
  IF v_disc IS NULL THEN RAISE EXCEPTION 'Bayi değilsiniz'; END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.slug, p.category, p.price_try,
         round(p.price_try * (100 - v_disc) / 100.0, 2),
         COALESCE((SELECT COUNT(*)::int FROM public.license_keys k
                   WHERE k.product_id = p.id AND k.status = 'available'), 0),
         p.unlimited_stock, p.manual_fulfillment
  FROM public.products p WHERE p.active = true
  ORDER BY p.sort_order, p.name;
END; $$;

-- ---- api: sipariş oluştur ----
CREATE OR REPLACE FUNCTION public.api_dealer_create_order(_user_id uuid, _product_id uuid, _quantity integer)
RETURNS TABLE(order_id uuid, reference_code text, total_try numeric, discount_try numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_disc numeric(5,2); v_p public.products%ROWTYPE; v_avail int;
  v_subtotal numeric(12,2); v_discount numeric(12,2);
  v_ref text := 'SBR-'; v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_i int; v_oid uuid;
BEGIN
  IF _quantity < 1 OR _quantity > 50 THEN RAISE EXCEPTION 'Adet 1-50 arası olmalı'; END IF;
  SELECT COALESCE(d.discount_percent, t.discount_percent) INTO v_disc
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = _user_id AND d.active = true;
  IF v_disc IS NULL THEN RAISE EXCEPTION 'Bayi değilsiniz'; END IF;

  SELECT * INTO v_p FROM public.products WHERE id = _product_id AND active = true;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Ürün bulunamadı'; END IF;
  IF NOT v_p.manual_fulfillment AND NOT v_p.unlimited_stock THEN
    SELECT COUNT(*) INTO v_avail FROM public.license_keys WHERE product_id = v_p.id AND status = 'available';
    IF v_avail < _quantity THEN RAISE EXCEPTION 'Stokta yeterli anahtar yok (% adet)', v_avail; END IF;
  END IF;

  FOR v_i IN 1..8 LOOP
    v_ref := v_ref || substr(v_chars, 1 + floor(random()*length(v_chars))::int, 1);
  END LOOP;

  v_subtotal := round(v_p.price_try * _quantity, 2);
  v_discount := round(v_subtotal * v_disc / 100.0, 2);

  INSERT INTO public.orders (user_id, product_id, price_try, reference_code, status, item_count, user_note)
  VALUES (_user_id, NULL, v_subtotal, v_ref, 'pending', _quantity, 'Bayi API siparişi')
  RETURNING id INTO v_oid;

  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_try, product_name_snapshot)
  VALUES (v_oid, v_p.id, _quantity, v_p.price_try, v_p.name);

  IF v_discount > 0 THEN
    INSERT INTO public.order_discounts (order_id, code_snapshot, discount_try, product_id)
    VALUES (v_oid, 'BAYI-' || v_disc::text, v_discount, v_p.id);
  END IF;

  RETURN QUERY SELECT v_oid, v_ref, GREATEST(0, v_subtotal - v_discount), v_discount;
END; $$;

-- ---- api: cüzdandan öde ----
CREATE OR REPLACE FUNCTION public.api_dealer_pay_order(_user_id uuid, _order_id uuid)
RETURNS TABLE(license_key text, license_token text, balance_after numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid; v_status public.order_status;
  v_price numeric(12,2); v_discount numeric(12,2) := 0;
  v_final numeric(12,2); v_balance numeric(12,2);
  v_key text; v_token text;
BEGIN
  PERFORM set_config('app.trusted_op', '1', true);
  SELECT user_id, status, price_try INTO v_owner, v_status, v_price
  FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF v_owner <> _user_id THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF v_status <> 'pending' AND v_status <> 'reviewing' THEN
    RAISE EXCEPTION 'Bu sipariş için ödeme yapılamaz';
  END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_discount
  FROM public.order_discounts WHERE order_id = _order_id;
  v_final := GREATEST(0, v_price - v_discount);

  INSERT INTO public.wallets(user_id, balance_try) VALUES (_user_id, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_try INTO v_balance FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF v_balance < v_final THEN RAISE EXCEPTION 'Yetersiz bakiye'; END IF;

  UPDATE public.wallets SET balance_try = balance_try - v_final, updated_at = now()
    WHERE user_id = _user_id RETURNING balance_try INTO v_balance;

  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note, created_by)
  VALUES (_user_id, 'purchase', -v_final, v_balance, _order_id, 'Bayi API siparişi', _user_id);

  UPDATE public.orders SET status = 'approved', approved_at = now(), paid_with = 'wallet', updated_at = now()
    WHERE id = _order_id;

  SELECT * INTO v_key, v_token FROM public._assign_key_to_order(_order_id);
  RETURN QUERY SELECT v_key, v_token, v_balance;
END; $$;

-- ---- api: sipariş durumu + teslim edilen anahtarlar ----
CREATE OR REPLACE FUNCTION public.api_dealer_order(_user_id uuid, _reference text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM public.orders
  WHERE reference_code = _reference AND user_id = _user_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;

  RETURN jsonb_build_object(
    'reference_code', v_o.reference_code,
    'status', v_o.status,
    'total_try', v_o.price_try,
    'discount_try', COALESCE((SELECT SUM(discount_try) FROM public.order_discounts WHERE order_id = v_o.id), 0),
    'created_at', v_o.created_at,
    'approved_at', v_o.approved_at,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'product', oi.product_name_snapshot, 'quantity', oi.quantity, 'unit_price_try', oi.unit_price_try))
      FROM public.order_items oi WHERE oi.order_id = v_o.id), '[]'::jsonb),
    'keys', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'key', lk.key_value, 'expires_at', lk.expires_at, 'delivered_at', ok.delivered_at))
      FROM public.order_keys ok JOIN public.license_keys lk ON lk.id = ok.license_key_id
      WHERE ok.order_id = v_o.id), '[]'::jsonb)
  );
END; $$;

-- ---- api: bakiye ----
CREATE OR REPLACE FUNCTION public.api_dealer_balance(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_bal numeric(12,2); v_d record;
BEGIN
  SELECT COALESCE(balance_try, 0) INTO v_bal FROM public.wallets WHERE user_id = _user_id;
  SELECT d.code, d.tier_slug, COALESCE(d.discount_percent, t.discount_percent) AS disc,
         COALESCE(d.commission_percent, t.commission_percent) AS comm,
         d.total_volume_try, d.total_commission_try, d.paid_commission_try
  INTO v_d
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = _user_id;
  RETURN jsonb_build_object(
    'balance_try', COALESCE(v_bal, 0),
    'dealer_code', v_d.code, 'tier', v_d.tier_slug,
    'discount_percent', v_d.disc, 'commission_percent', v_d.comm,
    'total_volume_try', v_d.total_volume_try,
    'commission_pending_try', GREATEST(0, v_d.total_commission_try - v_d.paid_commission_try)
  );
END; $$;

REVOKE ALL ON FUNCTION public.api_dealer_auth(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_dealer_price_list(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_dealer_create_order(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_dealer_pay_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_dealer_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_dealer_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_dealer_auth(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_dealer_price_list(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_dealer_create_order(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_dealer_pay_order(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_dealer_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_dealer_balance(uuid) TO service_role;