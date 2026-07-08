
-- 1) Bildirim tercihleri
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  order_updates BOOLEAN NOT NULL DEFAULT true,
  wallet_events BOOLEAN NOT NULL DEFAULT true,
  marketing BOOLEAN NOT NULL DEFAULT true,
  abandonment BOOLEAN NOT NULL DEFAULT true,
  telegram_chat_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs read" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs write" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_np_upd BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Referans komisyon takibi (ilk 3 sipariş, %10)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_commission_paid BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tg_referral_commission_on_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer UUID;
  v_order_count INT;
  v_final NUMERIC(12,2);
  v_disc NUMERIC(12,2) := 0;
  v_commission NUMERIC(12,2);
  v_balance NUMERIC(12,2);
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.referral_commission_paid THEN RETURN NEW; END IF;

  SELECT referred_by INTO v_referrer FROM public.profiles WHERE id = NEW.user_id;
  IF v_referrer IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_order_count FROM public.orders
    WHERE user_id = NEW.user_id AND status = 'approved' AND id <> NEW.id;
  IF v_order_count >= 3 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(discount_try),0) INTO v_disc
    FROM public.order_discounts WHERE order_id = NEW.id;
  v_final := GREATEST(0, COALESCE(NEW.price_try,0) - v_disc);
  v_commission := ROUND(v_final * 0.10, 2);
  IF v_commission <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.wallets(user_id, balance_try) VALUES (v_referrer, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_try = balance_try + v_commission, updated_at = now()
    WHERE user_id = v_referrer RETURNING balance_try INTO v_balance;
  INSERT INTO public.wallet_transactions(user_id, kind, amount_try, balance_after, order_id, note)
    VALUES (v_referrer, 'referral_bonus', v_commission, v_balance, NEW.id,
      'Davet komisyonu (%10, sipariş #' || COALESCE(NEW.reference_code, NEW.id::text) || ')');
  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (v_referrer, 'referral_commission', 'Davet komisyonu kazandın',
      v_commission::text || ' ₺ cüzdanına eklendi.', '/cuzdan');

  UPDATE public.orders SET referral_commission_paid = true WHERE id = NEW.id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_referral_commission ON public.orders;
CREATE TRIGGER trg_referral_commission
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_referral_commission_on_approve();

-- 3) Terkedilmiş sipariş hatırlatma bayrağı
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS abandonment_notified_at TIMESTAMPTZ;

-- Terk edilmiş siparişleri döndüren admin RPC (cron için)
CREATE OR REPLACE FUNCTION public.list_abandoned_orders(_minutes INT DEFAULT 15)
RETURNS TABLE(order_id UUID, user_id UUID, price_try NUMERIC, reference_code TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.user_id, o.price_try, o.reference_code, o.created_at
  FROM public.orders o
  WHERE o.status = 'pending'
    AND o.abandonment_notified_at IS NULL
    AND o.created_at < now() - (_minutes || ' minutes')::interval
    AND o.created_at > now() - interval '24 hours'
    AND o.user_id IS NOT NULL
  ORDER BY o.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.mark_abandonment_notified(_order_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orders SET abandonment_notified_at = now() WHERE id = _order_id;
$$;

-- 4) Sipariş takip (public ref ile) — sadece güvenli alanlar
CREATE OR REPLACE FUNCTION public.get_order_by_reference(_ref TEXT)
RETURNS TABLE(
  order_id UUID,
  status public.order_status,
  reference_code TEXT,
  price_try NUMERIC,
  created_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  external_status TEXT,
  admin_note TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.status, o.reference_code, o.price_try, o.created_at, o.approved_at,
         o.external_status, o.admin_note
  FROM public.orders o
  WHERE o.reference_code = _ref
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_by_reference(TEXT) TO anon, authenticated;
