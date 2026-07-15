
DROP POLICY IF EXISTS "transfer başlat" ON public.license_transfers;
CREATE POLICY "transfer başlat" ON public.license_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = license_transfers.order_id
        AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update own orders" ON public.orders;

DROP POLICY IF EXISTS "Users update own pending topups" ON public.wallet_topups;
CREATE POLICY "Users update own pending topups" ON public.wallet_topups
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status = ANY (ARRAY['pending'::topup_status, 'reviewing'::topup_status])
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = ANY (ARRAY['pending'::topup_status, 'reviewing'::topup_status])
  );

DROP POLICY IF EXISTS "Users insert own order discounts" ON public.order_discounts;
CREATE POLICY "Admins insert order discounts" ON public.order_discounts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users insert own order items" ON public.order_items;
CREATE POLICY "Admins insert order items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
