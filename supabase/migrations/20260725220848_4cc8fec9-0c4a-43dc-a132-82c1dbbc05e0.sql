
CREATE OR REPLACE FUNCTION public.draw_raffle(_raffle_id uuid, _redraw boolean DEFAULT false)
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
  IF _r.status = 'drawn' AND NOT _redraw THEN RAISE EXCEPTION 'already_drawn'; END IF;

  -- If redrawing, release previously delivered keys back to the pool
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

  -- Efraimidis-Spirakis weighted reservoir: per ticket compute -ln(U) with weight 1;
  -- taking min per user then top-N ≡ weighted sampling proportional to ticket count.
  FOR _win IN
    WITH tickets AS (
      SELECT
        e.id AS entry_id, e.user_id,
        -- Deterministic U in (0,1) from seed + entry_id + ticket index
        -ln( GREATEST( 1e-18,
          ( ('x' || substr(md5(_seed || e.id::text || g::text), 1, 15))::bit(60)::bigint )::double precision
          / 1152921504606846976.0
        ) ) AS key
      FROM public.raffle_entries e, generate_series(1, e.entries_count) g
      WHERE e.raffle_id = _raffle_id
    ), best_per_user AS (
      SELECT DISTINCT ON (user_id) user_id, entry_id, key
      FROM tickets
      ORDER BY user_id, key ASC
    )
    SELECT entry_id, user_id FROM best_per_user ORDER BY key ASC LIMIT _num
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

-- Public preview: return anonymized participant sample for the live drawing reel
CREATE OR REPLACE FUNCTION public.raffle_participants_preview(_raffle_id uuid, _limit int DEFAULT 80)
 RETURNS TABLE(user_id uuid, display_name text, avatar_id text, tier text, tickets int)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT p.id, COALESCE(p.display_name, 'Anonim'),
         p.avatar_id::text, p.tier::text,
         SUM(e.entries_count)::int AS tickets
  FROM public.raffle_entries e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE e.raffle_id = _raffle_id
  GROUP BY p.id, p.display_name, p.avatar_id, p.tier
  ORDER BY tickets DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.raffle_participants_preview(uuid, int) TO anon, authenticated;
