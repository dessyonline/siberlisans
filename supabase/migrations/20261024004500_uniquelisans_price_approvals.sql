-- UniQLisans alış fiyatı düştüğünde satış fiyatını otomatik değiştirmek yerine
-- admin Telegram onayı bekleyen güvenli fiyat önerileri.

CREATE TABLE IF NOT EXISTS public.uniquelisans_price_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  external_id text NOT NULL,
  approval_code text NOT NULL UNIQUE,
  product_name text NOT NULL,
  supplier_previous_price numeric(12,2),
  supplier_new_price numeric(12,2) NOT NULL,
  current_price numeric(12,2) NOT NULL,
  proposed_price numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  pending_key text UNIQUE,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uniquelisans_price_approvals_pending
  ON public.uniquelisans_price_approvals(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_uniquelisans_price_approvals_product
  ON public.uniquelisans_price_approvals(product_id, created_at DESC);

GRANT ALL ON public.uniquelisans_price_approvals TO service_role;
ALTER TABLE public.uniquelisans_price_approvals ENABLE ROW LEVEL SECURITY;
