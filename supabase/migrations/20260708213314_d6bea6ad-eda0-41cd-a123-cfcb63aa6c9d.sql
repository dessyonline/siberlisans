-- Auto-categorize by product name keywords
CREATE OR REPLACE FUNCTION public.guess_product_category(_name text, _description text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text := lower(coalesce(_name, '') || ' ' || coalesce(_description, ''));
BEGIN
  IF s ~ '(midjourney|mid journey)' THEN RETURN 'Midjourney';
  ELSIF s ~ '(chatgpt|chat gpt|openai)' THEN RETURN 'ChatGPT';
  ELSIF s ~ '(gemini)' THEN RETURN 'Google Gemini';
  ELSIF s ~ '(nano banana)' THEN RETURN 'Nano Banana';
  ELSIF s ~ '(ideogram)' THEN RETURN 'Ideogram';
  ELSIF s ~ '(canva)' THEN RETURN 'Canva';
  ELSIF s ~ '(freepik)' THEN RETURN 'Freepik';
  ELSIF s ~ '(envato)' THEN RETURN 'Envato Elements';
  ELSIF s ~ '(flaticon)' THEN RETURN 'Flaticon';
  ELSIF s ~ '(vecteezy)' THEN RETURN 'Vecteezy';
  ELSIF s ~ '(motion array|motionarray)' THEN RETURN 'Motion Array';
  ELSIF s ~ '(coreldraw|corel draw)' THEN RETURN 'CorelDRAW';
  ELSIF s ~ '(adobe|photoshop|illustrator|premiere|after effects|lightroom|acrobat)' THEN RETURN 'Adobe';
  ELSIF s ~ '(autodesk|autocad|3ds max|maya|revit)' THEN RETURN 'Autodesk';
  ELSIF s ~ '(office\s*365|microsoft\s*365|m365)' THEN RETURN 'Office 365';
  ELSIF s ~ '(office|word|excel|powerpoint|outlook)' THEN RETURN 'Office';
  ELSIF s ~ '(windows\s*server)' THEN RETURN 'Windows Server';
  ELSIF s ~ '(windows|win\s*10|win\s*11|win10|win11)' THEN RETURN 'Windows';
  ELSIF s ~ '(wordpress|wp\s|eklenti|tema)' THEN RETURN 'Wordpress Eklentileri & Temaları';
  ELSIF s ~ '(seo|ahrefs|semrush|moz)' THEN RETURN 'Seo Araçları';
  ELSIF s ~ '(vpn|antivir|nordvpn|expressvpn|kaspersky|bitdefender|eset|norton)' THEN RETURN 'Vpn & Antivirüs';
  ELSIF s ~ '(steam|oyun|game)' THEN RETURN 'Steam Oyunları';
  ELSIF s ~ '(mail|email|e-posta|gmail|outlook\.com)' THEN RETURN 'Email Hesapları';
  ELSIF s ~ '(yapay\s*zeka|ai\s|ai$|artificial)' THEN RETURN 'Yapay Zeka';
  ELSIF s ~ '(görsel|gorsel|image|foto|photo|stock)' THEN RETURN 'Görsel Ürünler';
  ELSE
    RETURN 'Diğer';
  END IF;
END;
$$;

-- Trigger: auto-fill category when empty or 'Diğer'
CREATE OR REPLACE FUNCTION public.tg_products_auto_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.category IS NULL
     OR btrim(NEW.category) = ''
     OR lower(btrim(NEW.category)) IN ('diğer','diger','other')
  THEN
    NEW.category := public.guess_product_category(NEW.name, NEW.description);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_auto_category ON public.products;
CREATE TRIGGER trg_products_auto_category
BEFORE INSERT OR UPDATE OF name, description, category ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_products_auto_category();

-- Backfill: recategorize existing empty / "Diğer" rows
UPDATE public.products
SET category = public.guess_product_category(name, description)
WHERE category IS NULL
   OR btrim(category) = ''
   OR lower(btrim(category)) IN ('diğer','diger','other','diğer ürünler');