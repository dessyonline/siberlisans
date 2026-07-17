
-- Raffle module
CREATE TABLE public.raffles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  custom_prize_name text,
  entry_cost_points integer NOT NULL DEFAULT 0 CHECK (entry_cost_points >= 0),
  max_entries_per_user integer NOT NULL DEFAULT 1 CHECK (max_entries_per_user >= 1),
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','drawn','cancelled')),
  winner_user_id uuid,
  winner_entry_id uuid,
  drawn_at timestamptz,
  delivered_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.raffle_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id uuid NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  entries_count integer NOT NULL DEFAULT 1 CHECK (entries_count >= 1),
  points_spent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX raffle_entries_raffle_idx ON public.raffle_entries(raffle_id);
CREATE INDEX raffle_entries_user_idx ON public.raffle_entries(user_id);

GRANT SELECT ON public.raffles TO anon, authenticated;
GRANT ALL ON public.raffles TO service_role;
GRANT SELECT, INSERT ON public.raffle_entries TO authenticated;
GRANT ALL ON public.raffle_entries TO service_role;

ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raffles public read" ON public.raffles FOR SELECT USING (status IN ('active','drawn'));
CREATE POLICY "raffles admin all" ON public.raffles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "raffle_entries own read" ON public.raffle_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "raffle_entries insert own via rpc" ON public.raffle_entries FOR INSERT TO authenticated
  WITH CHECK (false); -- forces going through enter_raffle RPC

CREATE OR REPLACE FUNCTION public.enter_raffle(_raffle_id uuid, _count integer DEFAULT 1)
RETURNS TABLE(entry_id uuid, total_entries integer, points_spent integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.raffles;
  _mine integer;
  _cost integer;
  _bal integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF _count < 1 THEN RAISE EXCEPTION 'invalid_count'; END IF;

  SELECT * INTO _r FROM public.raffles WHERE id = _raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status <> 'active' THEN RAISE EXCEPTION 'raffle_not_active'; END IF;
  IF now() < _r.start_at OR now() >= _r.end_at THEN RAISE EXCEPTION 'raffle_closed'; END IF;

  SELECT COALESCE(SUM(entries_count),0) INTO _mine
    FROM public.raffle_entries WHERE raffle_id = _raffle_id AND user_id = _uid;
  IF _mine + _count > _r.max_entries_per_user THEN RAISE EXCEPTION 'max_entries_reached'; END IF;

  _cost := _r.entry_cost_points * _count;
  IF _cost > 0 THEN
    SELECT COALESCE(total_points,0) INTO _bal FROM public.profiles WHERE id = _uid;
    IF _bal < _cost THEN RAISE EXCEPTION 'insufficient_points'; END IF;
    UPDATE public.profiles SET total_points = total_points - _cost WHERE id = _uid;
    INSERT INTO public.user_points_ledger(user_id, delta, reason, meta)
      VALUES (_uid, -_cost, 'raffle_entry', jsonb_build_object('raffle_id', _raffle_id, 'count', _count));
  END IF;

  INSERT INTO public.raffle_entries(raffle_id, user_id, entries_count, points_spent)
    VALUES (_raffle_id, _uid, _count, _cost)
    RETURNING id INTO entry_id;

  total_entries := _mine + _count;
  points_spent := _cost;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.enter_raffle(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.draw_raffle(_raffle_id uuid)
RETURNS TABLE(winner_user_id uuid, winner_entry_id uuid, delivered_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.raffles;
  _win_entry uuid;
  _win_user uuid;
  _key_row public.license_keys;
  _delivered text;
BEGIN
  IF NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT * INTO _r FROM public.raffles WHERE id = _raffle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'raffle_not_found'; END IF;
  IF _r.status = 'drawn' THEN RAISE EXCEPTION 'already_drawn'; END IF;

  -- weighted random: expand entries_count
  WITH expanded AS (
    SELECT e.id AS entry_id, e.user_id
    FROM public.raffle_entries e, generate_series(1, e.entries_count)
    WHERE e.raffle_id = _raffle_id
  )
  SELECT entry_id, user_id INTO _win_entry, _win_user FROM expanded ORDER BY random() LIMIT 1;

  IF _win_user IS NULL THEN RAISE EXCEPTION 'no_entries'; END IF;

  -- Deliver a pool key if product set
  IF _r.product_id IS NOT NULL THEN
    SELECT * INTO _key_row FROM public.license_keys
      WHERE product_id = _r.product_id AND status = 'available'
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF FOUND THEN
      UPDATE public.license_keys SET status = 'assigned', assigned_to = _win_user, assigned_at = now()
        WHERE id = _key_row.id;
      _delivered := _key_row.key_value;
    END IF;
  END IF;

  UPDATE public.raffles
    SET status = 'drawn', winner_user_id = _win_user, winner_entry_id = _win_entry,
        drawn_at = now(), delivered_key = _delivered, updated_at = now()
    WHERE id = _raffle_id;

  INSERT INTO public.notifications(user_id, title, body, kind, meta)
    VALUES (_win_user, 'Çekilişi kazandın!',
      'Tebrikler, "'||_r.title||'" çekilişini kazandın. Ödülünü hesabından kontrol et.',
      'raffle_win', jsonb_build_object('raffle_id', _raffle_id, 'key', _delivered));

  winner_user_id := _win_user;
  winner_entry_id := _win_entry;
  delivered_key := _delivered;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.draw_raffle(uuid) TO authenticated;
