
-- Restrict personal coupons: only owner or admin can read them
DROP POLICY IF EXISTS coupons_read_active ON public.coupons;
CREATE POLICY coupons_read_active ON public.coupons
FOR SELECT TO authenticated
USING (
  (is_active = true AND (is_personal = false OR user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Restrict user_badges to owner/admin; leaderboard uses a SECURITY DEFINER RPC
DROP POLICY IF EXISTS "rozet herkes okur" ON public.user_badges;
CREATE POLICY user_badges_owner_read ON public.user_badges
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
