DROP POLICY IF EXISTS "user updates own missions" ON public.user_missions;

CREATE POLICY "user updates own mission progress only"
ON public.user_missions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND completed_at IS NOT DISTINCT FROM (SELECT um.completed_at FROM public.user_missions um WHERE um.id = user_missions.id)
  AND claimed_at IS NOT DISTINCT FROM (SELECT um.claimed_at FROM public.user_missions um WHERE um.id = user_missions.id)
);