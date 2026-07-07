
DROP POLICY IF EXISTS "Users update own pending orders" ON public.orders;
CREATE POLICY "Users update own orders"
ON public.orders FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
