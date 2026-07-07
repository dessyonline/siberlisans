
DROP POLICY IF EXISTS "Users update own orders" ON public.orders;

CREATE OR REPLACE FUNCTION public.prevent_order_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.price_try IS DISTINCT FROM OLD.price_try
     OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Bu alanları değiştirme yetkiniz yok';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_order_sensitive_update ON public.orders;
CREATE TRIGGER trg_prevent_order_sensitive_update
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_order_sensitive_update();

CREATE POLICY "Users update own orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
