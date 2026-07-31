DO $mig$
DECLARE
  v_def text;
  v_block text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname = '_assign_key_to_order' AND pronamespace = 'public'::regnamespace;
  LOOP
    v_block := (regexp_match(v_def, '    IF v_manual AND NOT v_unlimited.*?\n    END IF;\n\n', 'ns'))[1];
    EXIT WHEN v_block IS NULL;
    v_def := replace(v_def, v_block, '');
  END LOOP;
  EXECUTE v_def;
END
$mig$;