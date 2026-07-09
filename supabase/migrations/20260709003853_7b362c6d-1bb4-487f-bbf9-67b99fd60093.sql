
CREATE TABLE public.supplier_check_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'uniquelisans',
  user_id uuid,
  product_id uuid,
  product_name text,
  external_id text,
  stock_ok boolean,
  stock_count integer,
  is_stock boolean,
  supplier_amount numeric(12,2),
  balance numeric(12,2),
  balance_ok boolean,
  blocked boolean NOT NULL DEFAULT false,
  block_reason text,
  context text,
  error text
);

CREATE INDEX supplier_check_logs_created_idx ON public.supplier_check_logs (created_at DESC);
CREATE INDEX supplier_check_logs_blocked_idx ON public.supplier_check_logs (blocked, created_at DESC);

GRANT SELECT ON public.supplier_check_logs TO authenticated;
GRANT ALL ON public.supplier_check_logs TO service_role;

ALTER TABLE public.supplier_check_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read supplier check logs"
ON public.supplier_check_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
