CREATE OR REPLACE FUNCTION public.ai_video_prices()
 RETURNS TABLE(quality text, duration integer, cost_try numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT COALESCE(lower(tier::text),'bronze') AS tier FROM profiles WHERE id = auth.uid()),
       disc AS (SELECT CASE WHEN tier IN ('gold','platinum') THEN 0.80 ELSE 1.0 END AS m FROM me)
  SELECT q.quality, q.duration, ROUND(q.base * COALESCE((SELECT m FROM disc), 1.0), 0)::numeric
  FROM (VALUES
    ('fast'::text,5,10::numeric),('fast',10,20),
    ('hd',5,30),('hd',10,60),
    ('cinematic',5,70),('cinematic',10,140)
  ) AS q(quality,duration,base);
$function$;