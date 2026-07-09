CREATE TABLE public.cross_sell_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_category text NOT NULL,
  to_category text NOT NULL,
  discount_percent integer NOT NULL CHECK (discount_percent BETWEEN 1 AND 90),
  promo_code text,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cross_sell_rules TO authenticated;
GRANT ALL ON public.cross_sell_rules TO service_role;

ALTER TABLE public.cross_sell_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read active rules"
  ON public.cross_sell_rules FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "admins manage cross_sell_rules"
  ON public.cross_sell_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cross_sell_rules_updated_at
  BEFORE UPDATE ON public.cross_sell_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();