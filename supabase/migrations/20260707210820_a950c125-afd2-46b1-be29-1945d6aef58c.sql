DO $$
DECLARE
  r RECORD;
  abc TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_key TEXT;
  seg TEXT;
  i INT;
  j INT;
BEGIN
  FOR r IN SELECT id FROM public.license_keys
           WHERE status = 'available'
             AND key_value NOT LIKE 'SIBER-%'
             AND key_value ~ '^(LVBL|SIBER)-'
  LOOP
    LOOP
      new_key := 'SIBER';
      FOR i IN 1..3 LOOP
        seg := '';
        FOR j IN 1..4 LOOP
          seg := seg || substr(abc, 1 + floor(random() * length(abc))::int, 1);
        END LOOP;
        new_key := new_key || '-' || seg;
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.license_keys WHERE key_value = new_key);
    END LOOP;
    UPDATE public.license_keys SET key_value = new_key WHERE id = r.id;
  END LOOP;
END $$;