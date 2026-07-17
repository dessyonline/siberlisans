
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.raffles
  ADD COLUMN IF NOT EXISTS min_tier public.user_tier,
  ADD COLUMN IF NOT EXISTS num_winners integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seed_commit text,
  ADD COLUMN IF NOT EXISTS seed_reveal text,
  ADD COLUMN IF NOT EXISTS draw_hash text,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_days integer,
  ADD COLUMN IF NOT EXISTS template_of uuid,
  ADD COLUMN IF NOT EXISTS tickets_per_amount_try numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_bonus_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_bonus_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS announce_start_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS announce_end_sent_at timestamptz;

ALTER TABLE public.raffles
  DROP CONSTRAINT IF EXISTS raffles_num_winners_ck,
  ADD CONSTRAINT raffles_num_winners_ck CHECK (num_winners BETWEEN 1 AND 20);

CREATE TABLE IF NOT EXISTS public.raffle_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id uuid NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  entry_id uuid,
  place integer NOT NULL DEFAULT 1,
  delivered_key text,
  is_backup boolean NOT NULL DEFAULT false,
  disqualified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raffle_winners_raffle_idx ON public.raffle_winners(raffle_id);
GRANT SELECT ON public.raffle_winners TO anon, authenticated;
GRANT ALL ON public.raffle_winners TO service_role;
ALTER TABLE public.raffle_winners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "raffle_winners public read" ON public.raffle_winners;
CREATE POLICY "raffle_winners public read" ON public.raffle_winners FOR SELECT USING (true);
DROP POLICY IF EXISTS "raffle_winners admin" ON public.raffle_winners;
CREATE POLICY "raffle_winners admin" ON public.raffle_winners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.raffle_daily_claims (
  user_id uuid NOT NULL,
  raffle_id uuid NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  claim_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, raffle_id, claim_date)
);
GRANT SELECT ON public.raffle_daily_claims TO authenticated;
GRANT ALL ON public.raffle_daily_claims TO service_role;
ALTER TABLE public.raffle_daily_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "raffle_daily_claims own" ON public.raffle_daily_claims;
CREATE POLICY "raffle_daily_claims own" ON public.raffle_daily_claims FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.raffle_shares (
  user_id uuid NOT NULL,
  raffle_id uuid NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  platform text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, raffle_id, platform)
);
GRANT SELECT ON public.raffle_shares TO authenticated;
GRANT ALL ON public.raffle_shares TO service_role;
ALTER TABLE public.raffle_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "raffle_shares own" ON public.raffle_shares;
CREATE POLICY "raffle_shares own" ON public.raffle_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.enter_raffle(uuid, integer);
CREATE OR REPLACE FUNCTION public.enter_raffle(_raffle_id uuid, _count integer DEFAULT 1)
RETURNS TABLE(entry_id uuid, total_entries integer, points_spent integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _r public.raffles; _mine integer; _cost integer; _bal integer;
  _my_tier public.user_tier; _tier_rank int; _min_rank int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF _count < 1 THEN RAISE EXCEPTION 'invalid_count'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id=_raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status <> 'active' THEN RAISE EXCEPTION 'raffle_not_active'; END IF;
  IF now() < _r.start_at OR now() >= _r.end_at THEN RAISE EXCEPTION 'raffle_closed'; END IF;
  IF _r.min_tier IS NOT NULL THEN
    SELECT tier INTO _my_tier FROM public.profiles WHERE id=_uid;
    _tier_rank := CASE _my_tier WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 ELSE 0 END;
    _min_rank  := CASE _r.min_tier WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 ELSE 0 END;
    IF _tier_rank < _min_rank THEN RAISE EXCEPTION 'tier_too_low'; END IF;
  END IF;
  SELECT COALESCE(SUM(entries_count),0) INTO _mine
    FROM public.raffle_entries WHERE raffle_id=_raffle_id AND user_id=_uid;
  IF _mine + _count > _r.max_entries_per_user THEN RAISE EXCEPTION 'max_entries_reached'; END IF;
  _cost := _r.entry_cost_points * _count;
  IF _cost > 0 THEN
    SELECT COALESCE(total_points,0) INTO _bal FROM public.profiles WHERE id=_uid;
    IF _bal < _cost THEN RAISE EXCEPTION 'insufficient_points'; END IF;
    UPDATE public.profiles SET total_points = total_points - _cost WHERE id=_uid;
    INSERT INTO public.user_points_ledger(user_id, delta, reason, meta)
      VALUES (_uid, -_cost, 'raffle_entry', jsonb_build_object('raffle_id',_raffle_id,'count',_count));
  END IF;
  INSERT INTO public.raffle_entries(raffle_id,user_id,entries_count,points_spent)
    VALUES(_raffle_id,_uid,_count,_cost) RETURNING id INTO entry_id;
  total_entries := _mine + _count; points_spent := _cost; RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.enter_raffle(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_raffle_ticket(_raffle_id uuid)
RETURNS TABLE(entry_id uuid, total_entries integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _r public.raffles; _mine integer; _today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id=_raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status <> 'active' OR now() >= _r.end_at THEN RAISE EXCEPTION 'raffle_closed'; END IF;
  IF NOT _r.daily_bonus_enabled THEN RAISE EXCEPTION 'daily_bonus_disabled'; END IF;
  IF EXISTS(SELECT 1 FROM public.raffle_daily_claims WHERE user_id=_uid AND raffle_id=_raffle_id AND claim_date=_today) THEN
    RAISE EXCEPTION 'already_claimed_today';
  END IF;
  SELECT COALESCE(SUM(entries_count),0) INTO _mine FROM public.raffle_entries WHERE raffle_id=_raffle_id AND user_id=_uid;
  IF _mine + 1 > _r.max_entries_per_user THEN RAISE EXCEPTION 'max_entries_reached'; END IF;
  INSERT INTO public.raffle_daily_claims(user_id,raffle_id,claim_date) VALUES(_uid,_raffle_id,_today);
  INSERT INTO public.raffle_entries(raffle_id,user_id,entries_count,points_spent)
    VALUES(_raffle_id,_uid,1,0) RETURNING id INTO entry_id;
  total_entries := _mine + 1; RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_daily_raffle_ticket(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_share_raffle_ticket(_raffle_id uuid, _platform text)
RETURNS TABLE(entry_id uuid, total_entries integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _r public.raffles; _mine integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF _platform NOT IN ('twitter','telegram','instagram','whatsapp','facebook') THEN RAISE EXCEPTION 'invalid_platform'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id=_raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status <> 'active' OR now() >= _r.end_at THEN RAISE EXCEPTION 'raffle_closed'; END IF;
  IF NOT _r.share_bonus_enabled THEN RAISE EXCEPTION 'share_bonus_disabled'; END IF;
  IF EXISTS(SELECT 1 FROM public.raffle_shares WHERE user_id=_uid AND raffle_id=_raffle_id AND platform=_platform) THEN
    RAISE EXCEPTION 'already_shared';
  END IF;
  SELECT COALESCE(SUM(entries_count),0) INTO _mine FROM public.raffle_entries WHERE raffle_id=_raffle_id AND user_id=_uid;
  IF _mine + 1 > _r.max_entries_per_user THEN RAISE EXCEPTION 'max_entries_reached'; END IF;
  INSERT INTO public.raffle_shares(user_id,raffle_id,platform) VALUES(_uid,_raffle_id,_platform);
  INSERT INTO public.raffle_entries(raffle_id,user_id,entries_count,points_spent)
    VALUES(_raffle_id,_uid,1,0) RETURNING id INTO entry_id;
  total_entries := _mine + 1; RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_share_raffle_ticket(uuid,text) TO authenticated;

DROP FUNCTION IF EXISTS public.draw_raffle(uuid);
CREATE OR REPLACE FUNCTION public.draw_raffle(_raffle_id uuid)
RETURNS TABLE(winner_user_id uuid, delivered_keys text[], draw_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _r public.raffles; _seed text; _hash text; _win record;
  _place int := 1; _num int; _key_row public.license_keys; _delivered text;
  _keys text[] := ARRAY[]::text[]; _primary_user uuid;
BEGIN
  IF NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id=_raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status = 'drawn' THEN RAISE EXCEPTION 'already_drawn'; END IF;
  _seed := encode(gen_random_bytes(32),'hex');
  _hash := encode(digest(_seed || _raffle_id::text,'sha256'),'hex');
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
      encode(digest(gen_random_bytes(32),'sha256'),'hex'));
  END IF;
  winner_user_id := _primary_user; delivered_keys := _keys; draw_hash := _hash; RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.draw_raffle(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.disqualify_raffle_winner(_winner_id uuid)
RETURNS TABLE(new_winner_id uuid, new_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _w public.raffle_winners; _r public.raffles; _pick record;
BEGIN
  IF NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT * INTO _w FROM public.raffle_winners WHERE id=_winner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _w.disqualified_at IS NOT NULL THEN RAISE EXCEPTION 'already_disqualified'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id=_w.raffle_id;
  UPDATE public.raffle_winners SET disqualified_at=now() WHERE id=_winner_id;
  SELECT e.id AS entry_id, e.user_id INTO _pick
  FROM public.raffle_entries e, generate_series(1,e.entries_count) g
  WHERE e.raffle_id=_w.raffle_id
    AND NOT EXISTS(SELECT 1 FROM public.raffle_winners w2 WHERE w2.raffle_id=_w.raffle_id AND w2.user_id=e.user_id AND w2.disqualified_at IS NULL)
  ORDER BY md5(COALESCE(_r.seed_reveal,'') || e.id::text || g::text) LIMIT 1;
  IF _pick.user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.raffle_winners(raffle_id,user_id,entry_id,place,is_backup)
    VALUES(_w.raffle_id,_pick.user_id,_pick.entry_id,_w.place,true)
    RETURNING id, user_id INTO new_winner_id, new_user_id;
  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES(_pick.user_id,'raffle_win','🎉 Yedek kazanan sensin!',
      'Bir çekilişte yedekten seçildin, ödülünü kontrol et.', '/hesabim/lisanslar');
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.disqualify_raffle_winner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_raffle_message(_raffle_id uuid, _title text, _body text, _link text DEFAULT '/cekilis')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.notifications(user_id,type,title,body,link)
  SELECT DISTINCT e.user_id,'raffle_update',_title,_body,_link
  FROM public.raffle_entries e WHERE e.raffle_id=_raffle_id;
  GET DIAGNOSTICS _c = ROW_COUNT;
  RETURN _c;
END $$;
GRANT EXECUTE ON FUNCTION public.broadcast_raffle_message(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.raffle_analytics(_raffle_id uuid)
RETURNS TABLE(total_entries bigint, unique_participants bigint, points_spent bigint, hourly jsonb, top_users jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT COALESCE(SUM(entries_count),0), COUNT(DISTINCT user_id), COALESCE(SUM(points_spent),0)
    INTO total_entries, unique_participants, points_spent
    FROM public.raffle_entries WHERE raffle_id=_raffle_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', c) ORDER BY h), '[]'::jsonb) INTO hourly
    FROM (
      SELECT date_trunc('hour', created_at) AS h, SUM(entries_count)::int AS c
      FROM public.raffle_entries WHERE raffle_id=_raffle_id GROUP BY 1
    ) x;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', y.user_id, 'entries', y.e, 'name', p.display_name) ORDER BY y.e DESC), '[]'::jsonb) INTO top_users
    FROM (
      SELECT user_id, SUM(entries_count)::int AS e
      FROM public.raffle_entries WHERE raffle_id=_raffle_id GROUP BY user_id ORDER BY e DESC LIMIT 10
    ) y LEFT JOIN public.profiles p ON p.id=y.user_id;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.raffle_analytics(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.raffle_winners_public AS
  SELECT rw.id, rw.raffle_id, rw.place, rw.is_backup,
         (rw.delivered_key IS NOT NULL) AS has_key,
         rw.created_at,
         COALESCE(p.display_name, 'Anonim') AS display_name
  FROM public.raffle_winners rw
  LEFT JOIN public.profiles p ON p.id = rw.user_id
  WHERE rw.disqualified_at IS NULL;
GRANT SELECT ON public.raffle_winners_public TO anon, authenticated;

UPDATE public.raffles SET seed_commit = encode(digest(gen_random_bytes(32),'sha256'),'hex') WHERE seed_commit IS NULL;
