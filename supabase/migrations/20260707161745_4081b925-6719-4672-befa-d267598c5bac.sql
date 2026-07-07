
-- Drop insecure public policies on license_keys
DROP POLICY IF EXISTS "Public claim by token" ON public.license_keys;
DROP POLICY IF EXISTS "Public claim update" ON public.license_keys;

-- Secure RPC: verifies exact activation_token match, returns key, marks claimed
CREATE OR REPLACE FUNCTION public.claim_license_by_token(_token text)
RETURNS TABLE(key_value text, activation_token text, claimed_at timestamptz, product_name text, delivery_type public.delivery_type)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_key text;
  v_token text;
  v_claimed timestamptz;
  v_name text;
  v_delivery public.delivery_type;
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RETURN;
  END IF;

  SELECT lk.id, lk.key_value, lk.activation_token, lk.claimed_at, p.name, p.delivery_type
    INTO v_id, v_key, v_token, v_claimed, v_name, v_delivery
  FROM public.license_keys lk
  JOIN public.products p ON p.id = lk.product_id
  WHERE lk.activation_token = _token
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  IF v_claimed IS NULL THEN
    UPDATE public.license_keys
      SET claimed_at = now()
      WHERE id = v_id
      RETURNING claimed_at INTO v_claimed;
  END IF;

  RETURN QUERY SELECT v_key, v_token, v_claimed, v_name, v_delivery;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_license_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_license_by_token(text) TO anon, authenticated;
