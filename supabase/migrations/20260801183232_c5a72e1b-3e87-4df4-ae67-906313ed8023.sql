ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS grants_app text,
  ADD COLUMN IF NOT EXISTS grants_app_days integer;

CREATE TABLE IF NOT EXISTS public.app_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_slug text NOT NULL,
  expires_at timestamptz,
  source_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_slug)
);

GRANT SELECT ON public.app_access TO authenticated;
GRANT ALL ON public.app_access TO service_role;
ALTER TABLE public.app_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_access_own_select" ON public.app_access;
CREATE POLICY "app_access_own_select" ON public.app_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "app_access_admin_all" ON public.app_access;
CREATE POLICY "app_access_admin_all" ON public.app_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.grant_app_access(
  _user_id uuid, _app_slug text, _days integer, _order_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new timestamptz;
BEGIN
  IF _user_id IS NULL OR _app_slug IS NULL THEN RETURN; END IF;

  IF _days IS NULL OR _days <= 0 THEN
    INSERT INTO public.app_access(user_id, app_slug, expires_at, source_order_id)
    VALUES (_user_id, _app_slug, NULL, _order_id)
    ON CONFLICT (user_id, app_slug) DO UPDATE
      SET expires_at = NULL, source_order_id = COALESCE(EXCLUDED.source_order_id, app_access.source_order_id), updated_at = now();
    RETURN;
  END IF;

  SELECT GREATEST(COALESCE(a.expires_at, now()), now()) + (_days || ' days')::interval
    INTO v_new FROM public.app_access a WHERE a.user_id = _user_id AND a.app_slug = _app_slug;

  IF v_new IS NULL THEN v_new := now() + (_days || ' days')::interval; END IF;

  INSERT INTO public.app_access(user_id, app_slug, expires_at, source_order_id)
  VALUES (_user_id, _app_slug, v_new, _order_id)
  ON CONFLICT (user_id, app_slug) DO UPDATE
    SET expires_at = CASE WHEN app_access.expires_at IS NULL THEN NULL ELSE EXCLUDED.expires_at END,
        source_order_id = COALESCE(EXCLUDED.source_order_id, app_access.source_order_id),
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.grant_app_access(uuid, text, integer, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_app_access(uuid, text, integer, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_orders_grant_app_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT p.grants_app, p.grants_app_days
    FROM public.products p
    WHERE p.grants_app IS NOT NULL
      AND (p.id = NEW.product_id
           OR p.id IN (SELECT oi.product_id FROM public.order_items oi WHERE oi.order_id = NEW.id))
  LOOP
    PERFORM public.grant_app_access(NEW.user_id, r.grants_app, r.grants_app_days, NEW.id);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_grant_app_access ON public.orders;
CREATE TRIGGER trg_orders_grant_app_access
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_grant_app_access();