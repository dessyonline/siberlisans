DROP POLICY IF EXISTS "Users view own order discounts" ON public.order_discounts;
CREATE POLICY "Users view own order discounts" ON public.order_discounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_discounts.order_id AND o.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );