
-- Loss protection: block products where selling price is below cost
CREATE OR REPLACE FUNCTION public.tg_guard_product_price_vs_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_try IS NOT NULL AND NEW.cost_try > 0 AND NEW.price_try < NEW.cost_try THEN
    RAISE EXCEPTION 'Zarar koruması: satış fiyatı (%.2f₺) maliyetin (%.2f₺) altında olamaz. Ürün: %',
      NEW.price_try, NEW.cost_try, NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_product_price_vs_cost ON public.products;
CREATE TRIGGER trg_guard_product_price_vs_cost
BEFORE INSERT OR UPDATE OF price_try, cost_try ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_product_price_vs_cost();

-- Flash sale loss guard: reject flash that would push effective price below cost
CREATE OR REPLACE FUNCTION public.tg_guard_flash_vs_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_cost numeric;
  v_name text;
  v_eff numeric;
BEGIN
  SELECT price_try, cost_try, name INTO v_price, v_cost, v_name
  FROM public.products WHERE id = NEW.product_id;
  IF v_cost IS NULL OR v_cost <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.discount_type = 'percent' THEN
    v_eff := v_price * (1 - NEW.discount_value / 100.0);
  ELSE
    v_eff := v_price - NEW.discount_value;
  END IF;
  IF v_eff < v_cost THEN
    RAISE EXCEPTION 'Zarar koruması: flash indirimden sonra fiyat %.2f₺ olur, maliyet %.2f₺. Ürün: %',
      v_eff, v_cost, v_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_flash_vs_cost ON public.flash_sales;
CREATE TRIGGER trg_guard_flash_vs_cost
BEFORE INSERT OR UPDATE ON public.flash_sales
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_flash_vs_cost();

-- Helper RPC: assigned keys list for admin (with order ref, user email, product)
CREATE OR REPLACE FUNCTION public.admin_list_assigned_keys(_limit integer DEFAULT 200)
RETURNS TABLE(
  key_id uuid,
  key_value text,
  product_id uuid,
  product_name text,
  order_id uuid,
  reference_code text,
  order_status text,
  user_email text,
  assigned_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  revoked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT
    lk.id,
    lk.key_value,
    lk.product_id,
    p.name,
    o.id,
    o.reference_code,
    o.status::text,
    u.email::text,
    lk.assigned_at,
    lk.activated_at,
    lk.expires_at,
    lk.revoked
  FROM public.license_keys lk
  LEFT JOIN public.products p ON p.id = lk.product_id
  LEFT JOIN public.orders o ON o.id = lk.assigned_order_id
  LEFT JOIN auth.users u ON u.id = o.user_id
  WHERE lk.status = 'assigned' OR lk.assigned_order_id IS NOT NULL
  ORDER BY lk.assigned_at DESC NULLS LAST
  LIMIT COALESCE(_limit, 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_assigned_keys(integer) TO authenticated;
