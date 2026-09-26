-- E-posta ile oluşturulan hesaplar ancak kod doğrulamasından sonra giriş yapar.
-- Mevcut kullanıcılar geriye dönük olarak doğrulanmış kabul edilir; böylece
-- yayına alındığında aktif hesaplar kilitlenmez.
ALTER TABLE IF EXISTS public.auth_users
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
BEGIN
  IF to_regclass('public.auth_users') IS NOT NULL THEN
    UPDATE public.auth_users
    SET email_confirmed_at = COALESCE(email_confirmed_at, created_at, now())
    WHERE email_confirmed_at IS NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.auth_email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_email_verifications_user_unique UNIQUE (user_id),
  CONSTRAINT auth_email_verifications_attempts_check CHECK (attempts >= 0 AND attempts <= 5)
);

CREATE INDEX IF NOT EXISTS auth_email_verifications_expiry_idx
  ON public.auth_email_verifications (expires_at);

-- IP engeliyle ilişkilendirilen hesaplar: oturumları derhal geçersizleşir ve
-- IP değişse bile süre bitene kadar yeniden giriş yapamaz.
CREATE TABLE IF NOT EXISTS public.account_blocks (
  user_id uuid PRIMARY KEY,
  source_ip inet,
  reason text,
  blocked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_blocks_source_ip_idx ON public.account_blocks (source_ip);

-- Bayilik seviyesi silinmiş/eski projelerde eksik kalmış olsa bile ilk seviye
-- garantilenir. ON CONFLICT mevcut özel ayarları değiştirmez.
INSERT INTO public.dealer_tiers (slug, name, min_volume_try, commission_percent, discount_percent, sort_order)
VALUES ('bronze', 'Bronz Bayi', 0, 8, 3, 1)
ON CONFLICT (slug) DO NOTHING;

-- Daha önce tier yabancı anahtar hatası yüzünden "approved" kalıp bayi satırı
-- oluşmayan başvuruları onarır; bu hesaplar paneli tekrar açabilir.
INSERT INTO public.dealers (
  user_id, code, company_name, tier_slug, active, approved_by, approved_at, created_at, updated_at
)
SELECT
  a.user_id,
  'BAYI' || upper(substr(replace(a.id::text, '-', ''), 1, 8)),
  a.company_name,
  'bronze',
  true,
  a.reviewed_by,
  COALESCE(a.reviewed_at, now()),
  COALESCE(a.created_at, now()),
  now()
FROM public.dealer_applications a
WHERE a.status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM public.dealers d WHERE d.user_id = a.user_id)
ON CONFLICT (user_id) DO NOTHING;

-- Otomatik ödeme-yükleme engeli hem IP'yi hem de engelin oluştuğu hesabı
-- kapsar. Böylece aynı kişi IP değiştirerek yeni yükleme talebi açamaz.
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
BEGIN
  IF NEW.is_vpn IS TRUE THEN
    RAISE EXCEPTION 'vpn_algilandi' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ip_blocks
    WHERE blocked_until > now()
      AND (ip = NEW.client_ip OR (user_id IS NOT NULL AND user_id = NEW.user_id))
  ) THEN
    RAISE EXCEPTION 'ip_veya_hesap_bloklu' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO active_count FROM public.wallet_topups
  WHERE user_id = NEW.user_id AND status IN ('pending', 'reviewing');
  IF active_count > 0 THEN RAISE EXCEPTION 'aktif_yukleme_talebi_var' USING ERRCODE = 'check_violation'; END IF;

  SELECT COUNT(*) INTO recent_user_count FROM public.wallet_topups
  WHERE user_id = NEW.user_id AND created_at > now() - interval '10 minutes';
  IF recent_user_count > 0 THEN RAISE EXCEPTION 'cok_sik_yukleme_talebi' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.client_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_ip_count FROM public.wallet_topups
    WHERE client_ip = NEW.client_ip AND created_at > now() - interval '10 minutes';
    IF recent_ip_count >= 3 THEN RAISE EXCEPTION 'ip_cok_sik_talep' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_block_spammy_ip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rej_count int;
BEGIN
  IF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') AND NEW.client_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO rej_count FROM public.wallet_topups
    WHERE client_ip = NEW.client_ip AND status = 'rejected' AND updated_at > now() - interval '24 hours';
    IF rej_count >= 3 THEN
      INSERT INTO public.ip_blocks (ip, blocked_until, reason, user_id)
      VALUES (NEW.client_ip, now() + interval '24 hours', 'auto: 3+ rejected topups in 24h', NEW.user_id)
      ON CONFLICT (ip) DO UPDATE
        SET blocked_until = GREATEST(public.ip_blocks.blocked_until, EXCLUDED.blocked_until),
            reason = EXCLUDED.reason,
            user_id = EXCLUDED.user_id;
      INSERT INTO public.account_blocks (user_id, source_ip, reason, blocked_until)
      VALUES (NEW.user_id, NEW.client_ip, 'auto: 3+ rejected topups in 24h', now() + interval '24 hours')
      ON CONFLICT (user_id) DO UPDATE
        SET source_ip = EXCLUDED.source_ip,
            reason = EXCLUDED.reason,
            blocked_until = GREATEST(public.account_blocks.blocked_until, EXCLUDED.blocked_until);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
