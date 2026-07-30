-- Fix: raffle_winners base table was exposing delivered_key and user_id to public.
-- Public display should use raffle_winners_public view only.

-- Revoke broad anon access to base table
REVOKE SELECT ON public.raffle_winners FROM anon;

-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "raffle_winners public read" ON public.raffle_winners;

-- Users can read their own winning rows (so they can see their delivered key)
DROP POLICY IF EXISTS "raffle_winners owner read" ON public.raffle_winners;
CREATE POLICY "raffle_winners owner read" ON public.raffle_winners
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can manage all rows
DROP POLICY IF EXISTS "raffle_winners admin" ON public.raffle_winners;
CREATE POLICY "raffle_winners admin" ON public.raffle_winners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
