
-- 1) partner_slug column for vanity URL
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS partner_slug text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_partner_slug ON public.profiles(partner_slug);

-- 2) referral_clicks table
CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL,
  partner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source text,
  ua_hash text,
  converted boolean NOT NULL DEFAULT false,
  converted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_partner ON public.referral_clicks(partner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_code ON public.referral_clicks(referral_code);

GRANT SELECT ON public.referral_clicks TO authenticated;
GRANT ALL ON public.referral_clicks TO service_role;

ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner reads own clicks" ON public.referral_clicks
  FOR SELECT TO authenticated
  USING (partner_user_id = auth.uid());

-- 3) record click RPC (SECURITY DEFINER so anon can log)
CREATE OR REPLACE FUNCTION public.record_referral_click(_code text, _source text, _ua_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _partner uuid;
  _id uuid;
BEGIN
  IF _code IS NULL OR length(_code) < 3 THEN RETURN NULL; END IF;
  SELECT id INTO _partner FROM public.profiles
    WHERE referral_code = upper(_code) OR partner_slug = lower(_code)
    LIMIT 1;
  IF _partner IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.referral_clicks(referral_code, partner_user_id, source, ua_hash)
  VALUES (upper(_code), _partner, left(coalesce(_source,''), 120), left(coalesce(_ua_hash,''),64))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_referral_click(text,text,text) TO anon, authenticated;

-- 4) partner_stats RPC
CREATE OR REPLACE FUNCTION public.partner_stats(_user_id uuid)
RETURNS TABLE(
  clicks_total bigint,
  clicks_30d bigint,
  conversions bigint,
  conversion_rate numeric,
  earnings_30d numeric,
  daily jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT count(*) AS total,
      count(*) FILTER (WHERE created_at > now() - interval '30 days') AS d30,
      count(*) FILTER (WHERE converted) AS conv
    FROM public.referral_clicks WHERE partner_user_id = _user_id
  ),
  e AS (
    SELECT coalesce(sum(amount_try),0) AS earned30
    FROM public.wallet_transactions
    WHERE user_id = _user_id AND kind = 'referral_bonus'
      AND created_at > now() - interval '30 days'
  ),
  d AS (
    SELECT jsonb_agg(jsonb_build_object('d', day::date, 'clicks', clicks, 'earn', earn) ORDER BY day) AS series
    FROM (
      SELECT day,
        coalesce((SELECT count(*) FROM public.referral_clicks
                    WHERE partner_user_id = _user_id
                      AND created_at::date = day::date), 0) AS clicks,
        coalesce((SELECT sum(amount_try) FROM public.wallet_transactions
                    WHERE user_id = _user_id AND kind='referral_bonus'
                      AND created_at::date = day::date), 0) AS earn
      FROM generate_series(current_date - interval '29 days', current_date, interval '1 day') AS day
    ) x
  )
  SELECT c.total, c.d30, c.conv,
    CASE WHEN c.total > 0 THEN round((c.conv::numeric / c.total) * 100, 1) ELSE 0 END,
    e.earned30,
    d.series
  FROM c, e, d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_stats(uuid) TO authenticated;

-- 5) Trigger to mark click as converted when a referred user completes first paid order
CREATE OR REPLACE FUNCTION public.mark_referral_click_converted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _partner uuid;
BEGIN
  IF NEW.referred_by IS NOT NULL AND (OLD.referral_bonus_paid = false) AND NEW.referral_bonus_paid = true THEN
    UPDATE public.referral_clicks
      SET converted = true, converted_user_id = NEW.id
      WHERE partner_user_id = NEW.referred_by
        AND converted = false
        AND created_at > NEW.created_at - interval '90 days'
        AND id = (
          SELECT id FROM public.referral_clicks
          WHERE partner_user_id = NEW.referred_by AND converted = false
          ORDER BY created_at DESC LIMIT 1
        );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_referral_converted ON public.profiles;
CREATE TRIGGER trg_mark_referral_converted
AFTER UPDATE OF referral_bonus_paid ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.mark_referral_click_converted();
