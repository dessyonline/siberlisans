DROP POLICY IF EXISTS "Users read own assigned keys" ON public.license_keys;
CREATE POLICY "Users read own assigned keys" ON public.license_keys
  FOR SELECT TO authenticated
  USING (
    assigned_order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = license_keys.assigned_order_id AND o.user_id = auth.uid()
    )
  );