-- ============ IP tracking, VPN detection, IP-based spam guard ============

ALTER TABLE public.wallet_topups
  ADD COLUMN IF NOT EXISTS client_ip inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS is_vpn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ip_country text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_ip inet,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS wallet_topups_client_ip_idx ON public.wallet_topups (client_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_client_ip_idx ON public.orders (client_ip, created_at DESC);

-- ============ IP block table (24h auto-ban) ============

CREATE TABLE IF NOT EXISTS public.ip_blocks (
  ip inet PRIMARY KEY,
  blocked_until timestamptz NOT NULL,
  reason text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_blocks TO authenticated;
GRANT ALL ON public.ip_blocks TO service_role;
ALTER TABLE public.ip_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ip_blocks" ON public.ip_blocks;
CREATE POLICY "Admins manage ip_blocks" ON public.ip_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ Update spam guard: VPN + IP rate limit + IP block ============

CREATE OR REPLACE FUNCTION public.enforce_wallet_topup_spam_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count int;
  recent_user_count int;
  recent_ip_count int;
  blocked_until_ts timestamptz;
BEGIN
  -- 1) VPN/proxy detected → reject
  IF NEW.is_vpn IS TRUE THEN
    RAISE EXCEPTION 'vpn_algilandi' USING ERRCODE = 'check_violation';
  END IF;

  -- 2) IP currently blocked → reject
  IF NEW.client_ip IS NOT NULL THEN
    SELECT blocked_until INTO blocked_until_ts
    FROM public.ip_blocks
    WHERE ip = NEW.client_ip AND blocked_until > now()
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ip_bloklu' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 3) Existing active topup for user
  SELECT COUNT(*) INTO active_count
  FROM public.wallet_topups
  WHERE user_id = NEW.user_id AND status IN ('pending', 'reviewing');
  IF active_count > 0 THEN
    RAISE EXCEPTION 'aktif_yukleme_talebi_var' USING ERRCODE = 'check_violation';
  END IF;

  -- 4) Rate limit per user: 10 min cooldown
  SELECT COUNT(*) INTO recent_user_count
  FROM public.wallet_topups
  WHERE user_id = NEW.user_id AND created_at > now() - interval '10 minutes';
  IF recent_user_count > 0 THEN
    RAISE EXCEPTION 'cok_sik_yukleme_talebi' USING ERRCODE = 'check_violation';
  END IF;

  -- 5) Rate limit per IP: max 3 in 10 min
  IF NEW.client_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_ip_count
    FROM public.wallet_topups
    WHERE client_ip = NEW.client_ip AND created_at > now() - interval '10 minutes';
    IF recent_ip_count >= 3 THEN
      RAISE EXCEPTION 'ip_cok_sik_talep' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============ Auto-block IP after 3 rejections in 24h ============

CREATE OR REPLACE FUNCTION public.auto_block_spammy_ip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rej_count int;
BEGIN
  IF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') AND NEW.client_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO rej_count
    FROM public.wallet_topups
    WHERE client_ip = NEW.client_ip
      AND status = 'rejected'
      AND updated_at > now() - interval '24 hours';
    IF rej_count >= 3 THEN
      INSERT INTO public.ip_blocks (ip, blocked_until, reason, user_id)
      VALUES (NEW.client_ip, now() + interval '24 hours',
              'auto: 3+ rejected topups in 24h', NEW.user_id)
      ON CONFLICT (ip) DO UPDATE
        SET blocked_until = GREATEST(public.ip_blocks.blocked_until, EXCLUDED.blocked_until),
            reason = EXCLUDED.reason;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_block_spammy_ip ON public.wallet_topups;
CREATE TRIGGER trg_auto_block_spammy_ip
  AFTER UPDATE ON public.wallet_topups
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_block_spammy_ip();