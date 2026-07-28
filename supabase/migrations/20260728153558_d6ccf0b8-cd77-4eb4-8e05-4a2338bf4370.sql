CREATE OR REPLACE FUNCTION public.dealer_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_d record; v_next record; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum yok'; END IF;
  SELECT d.*, t.name AS tier_name, t.commission_percent AS tier_commission, t.discount_percent AS tier_discount
    INTO v_d
  FROM public.dealers d JOIN public.dealer_tiers t ON t.slug = d.tier_slug
  WHERE d.user_id = v_uid;
  IF v_d.user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_next FROM public.dealer_tiers
   WHERE min_volume_try > v_d.total_volume_try ORDER BY min_volume_try ASC LIMIT 1;

  SELECT jsonb_build_object(
    'code', v_d.code,
    'company_name', v_d.company_name,
    'active', v_d.active,
    'tier_slug', v_d.tier_slug,
    'tier_name', v_d.tier_name,
    'commission_percent', COALESCE(v_d.commission_percent, v_d.tier_commission),
    'discount_percent', COALESCE(v_d.discount_percent, v_d.tier_discount),
    'total_volume_try', v_d.total_volume_try,
    'total_commission_try', v_d.total_commission_try,
    'paid_commission_try', v_d.paid_commission_try,
    'pending_commission_try', (SELECT COALESCE(SUM(amount_try),0) FROM public.dealer_commissions
                               WHERE dealer_user_id = v_uid AND status = 'pending'),
    'customer_count', (SELECT COUNT(*) FROM public.profiles WHERE dealer_id = v_uid),
    'order_count', (SELECT COUNT(*) FROM public.dealer_commissions WHERE dealer_user_id = v_uid),
    'next_tier', CASE WHEN v_next.slug IS NULL THEN NULL ELSE jsonb_build_object(
        'name', v_next.name, 'min_volume_try', v_next.min_volume_try,
        'commission_percent', v_next.commission_percent, 'discount_percent', v_next.discount_percent) END,
    'monthly', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'month', s.m, 'volume', s.volume, 'commission', s.commission, 'orders', s.orders
             ) ORDER BY s.m), '[]'::jsonb)
      FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS m,
               SUM(base_amount_try) AS volume,
               SUM(amount_try) AS commission,
               COUNT(*) AS orders
        FROM public.dealer_commissions
        WHERE dealer_user_id = v_uid AND created_at > now() - interval '6 months'
        GROUP BY 1
      ) s
    )
  ) INTO v_res;
  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dealer_stats() TO authenticated;