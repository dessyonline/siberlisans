CREATE OR REPLACE FUNCTION public.digest(data text, type text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
  SELECT extensions.digest(data, type);
$$;

CREATE OR REPLACE FUNCTION public.digest(data bytea, type text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
  SELECT extensions.digest(data, type);
$$;

GRANT EXECUTE ON FUNCTION public.digest(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.digest(bytea, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.draw_raffle(_raffle_id uuid)
RETURNS TABLE(winner_user_id uuid, delivered_keys text[], draw_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid(); _r public.raffles; _seed text; _hash text; _win record;
  _place int := 1; _num int; _key_row public.license_keys; _delivered text;
  _keys text[] := ARRAY[]::text[]; _primary_user uuid;
BEGIN
  IF NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id=_raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status = 'drawn' THEN RAISE EXCEPTION 'already_drawn'; END IF;
  _seed := encode(public.gen_random_bytes(32),'hex');
  _hash := encode(public.digest((_seed || _raffle_id::text)::text,'sha256'::text),'hex');
  _num  := GREATEST(1, LEAST(COALESCE(_r.num_winners,1), 20));
  DELETE FROM public.raffle_winners WHERE raffle_id=_raffle_id;
  FOR _win IN
    WITH expanded AS (
      SELECT e.id AS entry_id, e.user_id, md5(_seed || e.id::text || g::text) AS r
      FROM public.raffle_entries e, generate_series(1, e.entries_count) g
      WHERE e.raffle_id = _raffle_id
    ), picked AS (
      SELECT DISTINCT ON (user_id) entry_id, user_id, r FROM expanded ORDER BY user_id, r
    )
    SELECT entry_id, user_id FROM picked ORDER BY r LIMIT _num
  LOOP
    _delivered := NULL;
    IF _r.product_id IS NOT NULL THEN
      SELECT * INTO _key_row FROM public.license_keys
        WHERE product_id=_r.product_id AND status='available'
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
      IF FOUND THEN
        UPDATE public.license_keys SET status='assigned', assigned_at=now() WHERE id=_key_row.id;
        _delivered := _key_row.key_value; _keys := _keys || _delivered;
      END IF;
    END IF;
    INSERT INTO public.raffle_winners(raffle_id,user_id,entry_id,place,delivered_key)
      VALUES(_raffle_id,_win.user_id,_win.entry_id,_place,_delivered);
    IF _place = 1 THEN _primary_user := _win.user_id; END IF;
    INSERT INTO public.notifications(user_id, type, title, body, link)
      VALUES(_win.user_id, 'raffle_win',
        '🎉 Çekilişi kazandın! ('||_place||'.)',
        'Tebrikler, "'||_r.title||'" çekilişinde '||_place||'. oldun. Ödülünü hesabından kontrol et.',
        '/hesabim/lisanslar');
    _place := _place + 1;
  END LOOP;
  IF _primary_user IS NULL THEN RAISE EXCEPTION 'no_entries'; END IF;
  UPDATE public.raffles
    SET status='drawn', winner_user_id=_primary_user, drawn_at=now(),
        seed_reveal=_seed, draw_hash=_hash, updated_at=now()
    WHERE id=_raffle_id;
  INSERT INTO public.notifications(user_id, type, title, body, link)
  SELECT DISTINCT e.user_id, 'raffle_result','Çekiliş sonuçlandı',
    '"'||_r.title||'" çekilişi tamamlandı. Bu sefer olmadı, bir sonrakinde bol şans!','/cekilis'
  FROM public.raffle_entries e
  WHERE e.raffle_id=_raffle_id
    AND NOT EXISTS(SELECT 1 FROM public.raffle_winners w WHERE w.raffle_id=_raffle_id AND w.user_id=e.user_id);
  IF _r.is_recurring AND COALESCE(_r.recurrence_days,0) > 0 THEN
    INSERT INTO public.raffles(title, description, image_url, product_id, custom_prize_name,
      entry_cost_points, max_entries_per_user, start_at, end_at, status, created_by,
      min_tier, num_winners, featured, is_recurring, recurrence_days, template_of,
      daily_bonus_enabled, share_bonus_enabled, tickets_per_amount_try, seed_commit)
    VALUES (_r.title, _r.description, _r.image_url, _r.product_id, _r.custom_prize_name,
      _r.entry_cost_points, _r.max_entries_per_user, now(), now() + (_r.recurrence_days || ' days')::interval,
      'active', _r.created_by, _r.min_tier, _r.num_winners, _r.featured, true, _r.recurrence_days,
      COALESCE(_r.template_of,_r.id), _r.daily_bonus_enabled, _r.share_bonus_enabled, _r.tickets_per_amount_try,
      encode(public.digest(public.gen_random_bytes(32),'sha256'::text),'hex'));
  END IF;
  winner_user_id := _primary_user; delivered_keys := _keys; draw_hash := _hash; RETURN NEXT;
END $function$;

GRANT EXECUTE ON FUNCTION public.draw_raffle(uuid) TO authenticated;