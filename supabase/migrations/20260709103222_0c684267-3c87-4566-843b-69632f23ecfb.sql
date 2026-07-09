
INSERT INTO public.coupons (code, discount_type, discount_value, min_order_try, is_active, max_uses, used_count)
VALUES ('KOD5', 'percent', 5, 0, true, NULL, 0)
ON CONFLICT (code) DO UPDATE
  SET discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      min_order_try = EXCLUDED.min_order_try,
      is_active = true,
      expires_at = NULL;
