CREATE OR REPLACE VIEW public.raffle_winners_public
WITH (security_invoker = on) AS
SELECT
  rw.id,
  rw.raffle_id,
  rw.place,
  rw.is_backup,
  rw.delivered_key IS NOT NULL AS has_key,
  rw.created_at,
  COALESCE(p.display_name, 'Anonim') AS display_name,
  p.avatar_id,
  p.tier
FROM public.raffle_winners rw
LEFT JOIN public.profiles p ON p.id = rw.user_id
WHERE rw.disqualified_at IS NULL;

GRANT SELECT ON public.raffle_winners_public TO anon, authenticated;