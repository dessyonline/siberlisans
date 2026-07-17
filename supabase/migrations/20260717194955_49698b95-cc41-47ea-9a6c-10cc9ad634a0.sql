
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

  WITH expanded AS (
    SELECT e.id AS entry_id, e.user_id
    FROM public.raffle_entries e, generate_series(1, e.entries_count)
    WHERE e.raffle_id = _raffle_id
  )
  SELECT entry_id, user_id INTO _win_entry, _win_user FROM expanded ORDER BY random() LIMIT 1;

  IF _win_user IS NULL THEN RAISE EXCEPTION 'no_entries'; END IF;

  IF _r.product_id IS NOT NULL THEN
    SELECT * INTO _key_row FROM public.license_keys
      WHERE product_id = _r.product_id AND status = 'available'
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF FOUND THEN
      UPDATE public.license_keys
        SET status = 'assigned', assigned_at = now()
        WHERE id = _key_row.id;
      _delivered := _key_row.key_value;
    END IF;
  END IF;

  UPDATE public.raffles
    SET status = 'drawn', winner_user_id = _win_user, winner_entry_id = _win_entry,
        drawn_at = now(), delivered_key = _delivered, updated_at = now()
    WHERE id = _raffle_id;

  INSERT INTO public.notifications(user_id, title, body, kind, meta)
    VALUES (_win_user, '🎉 Çekilişi kazandın!',
      'Tebrikler, "'||_r.title||'" çekilişini kazandın. Ödülünü hesabından kontrol et.',
      'raffle_win', jsonb_build_object('raffle_id', _raffle_id, 'key', _delivered));

  INSERT INTO public.notifications(user_id, title, body, kind, meta)
  SELECT DISTINCT e.user_id,
         'Çekiliş sonuçlandı',
         '"'||_r.title||'" çekilişi tamamlandı. Bu sefer kazanamadın, bir sonrakinde bol şans!',
         'raffle_result',
         jsonb_build_object('raffle_id', _raffle_id, 'won', false)
  FROM public.raffle_entries e
  WHERE e.raffle_id = _raffle_id AND e.user_id <> _win_user;

  winner_user_id := _win_user;
  winner_entry_id := _win_entry;
  delivered_key := _delivered;
  RETURN NEXT;
END $$;
