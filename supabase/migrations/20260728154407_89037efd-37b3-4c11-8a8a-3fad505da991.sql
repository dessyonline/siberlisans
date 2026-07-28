CREATE TABLE public.dealer_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  events text[] NOT NULL DEFAULT ARRAY['product.updated'],
  active boolean NOT NULL DEFAULT true,
  fail_count integer NOT NULL DEFAULT 0,
  last_status integer,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dealer_webhooks TO authenticated;
GRANT ALL ON public.dealer_webhooks TO service_role;
ALTER TABLE public.dealer_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealers manage own webhooks" ON public.dealer_webhooks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.dealers d WHERE d.user_id = auth.uid() AND d.active
  ));

CREATE POLICY "Admins view webhooks" ON public.dealer_webhooks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_dealer_webhooks_updated_at
  BEFORE UPDATE ON public.dealer_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.catalog_events (
  id bigserial PRIMARY KEY,
  product_id uuid,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.catalog_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_events_id_seq TO service_role;
ALTER TABLE public.catalog_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read catalog events" ON public.catalog_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_catalog_events_pending ON public.catalog_events (created_at) WHERE NOT delivered;

CREATE OR REPLACE FUNCTION public.queue_catalog_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.active THEN RETURN NEW; END IF;
    ev := 'product.created';
  ELSE
    IF NEW.price_try IS DISTINCT FROM OLD.price_try THEN
      ev := 'product.price_changed';
    ELSIF NEW.active IS DISTINCT FROM OLD.active
       OR NEW.supplier_out_of_stock IS DISTINCT FROM OLD.supplier_out_of_stock
       OR NEW.stock_hint IS DISTINCT FROM OLD.stock_hint
       OR NEW.unlimited_stock IS DISTINCT FROM OLD.unlimited_stock THEN
      ev := 'product.stock_changed';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.catalog_events (product_id, event, payload)
  VALUES (NEW.id, ev, jsonb_build_object(
    'id', NEW.id,
    'slug', NEW.slug,
    'name', NEW.name,
    'category', NEW.category,
    'price_try', NEW.price_try,
    'active', NEW.active,
    'in_stock', (NEW.active AND NOT NEW.supplier_out_of_stock),
    'unlimited_stock', NEW.unlimited_stock,
    'stock_hint', NEW.stock_hint,
    'image_url', NEW.image_url
  ));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_catalog_event
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.queue_catalog_event();