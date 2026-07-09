
CREATE OR REPLACE FUNCTION public.enforce_min_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.external_price IS NOT NULL
     AND NEW.external_price > 0
     AND NEW.price_try < NEW.external_price + 200 THEN
    RAISE EXCEPTION 'Minimum kar 200 TL olmalı: alış %₺, satış %₺ (fark %₺). Satış fiyatını en az %₺ yap.',
      NEW.external_price,
      NEW.price_try,
      NEW.price_try - NEW.external_price,
      NEW.external_price + 200;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_min_profit ON public.products;
CREATE TRIGGER trg_enforce_min_profit
BEFORE INSERT OR UPDATE OF price_try, external_price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_min_profit();
