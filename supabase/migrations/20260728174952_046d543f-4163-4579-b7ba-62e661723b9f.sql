DROP FUNCTION IF EXISTS public.draw_raffle(uuid);
DROP FUNCTION IF EXISTS public.draw_raffle(uuid, boolean);

CREATE OR REPLACE FUNCTION public.draw_raffle(_raffle_id uuid, _redraw boolean DEFAULT false, _forced_user_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(winner_user_id uuid, delivered_keys text[], draw_hash text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid(); _r public.raffles; _seed text; _hash text; _win record;
  _place int := 1; _num int; _key_row public.license_keys; _delivered text;
  _keys text[] := ARRAY[]::text[]; _primary_user uuid;
  _forced uuid[] := COALESCE(_forced_user_ids, ARRAY[]::uuid[]);
BEGIN
  IF NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id=_raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status = 'drawn' AND NOT _redraw THEN RAISE EXCEPTION 'already_drawn'; END IF;

  IF _r.status = 'drawn' AND _redraw THEN
    UPDATE public.license_keys lk
       SET status='available', assigned_at=NULL
      FROM public.raffle_winners w
     WHERE w.raffle_id=_raffle_id
       AND w.delivered_key IS NOT NULL
       AND lk.key_value = w.delivered_key
       AND lk.product_id = _r.product_id;
  END IF;

  DELETE FROM public.raffle_winners WHERE raffle_id=_raffle_id;

  _seed := encode(public.gen_random_bytes(32),'hex');
  _hash := encode(public.digest((_seed || _raffle_id::text)::text,'sha256'::text),'hex');
  _num  := GREATEST(1, LEAST(COALESCE(_r.num_winners,1), 20));
  IF array_length(_forced,1) IS NOT NULL THEN
    _num := GREATEST(_num, array_length(_forced,1));
  END IF;

  FOR _win IN
    WITH forced AS (
      SELECT f.user_id, f.ord,
             (SELECT e.id FROM public.raffle_entries e
               WHERE e.raffle_id=_raffle_id AND e.user_id=f.user_id LIMIT 1) AS entry_id
      FROM unnest(_forced) WITH ORDINALITY AS f(user_id, ord)
    ), tickets AS (
      SELECT
        e.id AS entry_id, e.user_id,
        -ln( GREATEST( 1e-18,
          ( ('x' || substr(md5(_seed || e.id::text || g::text), 1, 15))::bit(60)::bigint )::double precision
          / 1152921504606846976.0
        ) ) AS key
      FROM public.raffle_entries e, generate_series(1, e.entries_count) g
      WHERE e.raffle_id = _raffle_id
        AND NOT (e.user_id = ANY(_forced))
    ), best_per_user AS (
      SELECT DISTINCT ON (user_id) user_id, entry_id, key
      FROM tickets
      ORDER BY user_id, key ASC
    ), combined AS (
      SELECT entry_id, user_id, 0 AS grp, ord::double precision AS ord FROM forced
      UNION ALL
      SELECT entry_id, user_id, 1 AS grp, key AS ord FROM best_per_user
    )
    SELECT entry_id, user_id FROM combined ORDER BY grp ASC, ord ASC LIMIT _num
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

  IF NOT _redraw THEN
    INSERT INTO public.notifications(user_id, type, title, body, link)
    SELECT DISTINCT e.user_id, 'raffle_result','Çekiliş sonuçlandı',
      '"'||_r.title||'" çekilişi tamamlandı. Sonuçları gör.', '/cekilis'
    FROM public.raffle_entries e
    WHERE e.raffle_id=_raffle_id AND e.user_id <> _primary_user;
  END IF;

  RETURN QUERY SELECT _primary_user, _keys, _hash;
END $function$;

REVOKE ALL ON FUNCTION public.draw_raffle(uuid, boolean, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.draw_raffle(uuid, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.draw_raffle(uuid, boolean, uuid[]) TO service_role;