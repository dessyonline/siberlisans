CREATE OR REPLACE FUNCTION public.raffle_analytics(_raffle_id uuid)
RETURNS TABLE(total_entries bigint, unique_participants bigint, points_spent bigint, hourly jsonb, top_users jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;

  SELECT COALESCE(SUM(re.entries_count),0),
         COUNT(DISTINCT re.user_id),
         COALESCE(SUM(re.points_spent),0)
    INTO total_entries, unique_participants, points_spent
    FROM public.raffle_entries re
    WHERE re.raffle_id = _raffle_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', x.h, 'count', x.c) ORDER BY x.h), '[]'::jsonb)
    INTO hourly
    FROM (
      SELECT date_trunc('hour', re.created_at) AS h, SUM(re.entries_count)::int AS c
      FROM public.raffle_entries re
      WHERE re.raffle_id = _raffle_id
      GROUP BY 1
    ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', y.user_id, 'entries', y.e, 'name', p.display_name) ORDER BY y.e DESC), '[]'::jsonb)
    INTO top_users
    FROM (
      SELECT re.user_id, SUM(re.entries_count)::int AS e
      FROM public.raffle_entries re
      WHERE re.raffle_id = _raffle_id
      GROUP BY re.user_id
      ORDER BY e DESC
      LIMIT 10
    ) y
    LEFT JOIN public.profiles p ON p.id = y.user_id;

  RETURN NEXT;
END $function$;