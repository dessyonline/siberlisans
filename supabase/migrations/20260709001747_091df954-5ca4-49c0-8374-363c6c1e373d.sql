-- 1) Column
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_email boolean NOT NULL DEFAULT false;

-- 2) Duration normalisation: "sınırsız" -> lifetime
UPDATE public.products
   SET duration = 'lifetime'
 WHERE duration <> 'lifetime'
   AND (
        name ILIKE '%sınırsız%' OR name ILIKE '%sinirsiz%'
     OR description ILIKE '%sınırsız%' OR description ILIKE '%sinirsiz%'
     OR description ILIKE '%ömürlük%' OR description ILIKE '%omurluk%'
     OR name ILIKE '%ömürlük%' OR name ILIKE '%omurluk%'
   );

-- 3) Duration normalisation: "yıl / yıllık" -> yearly (skip if already lifetime)
UPDATE public.products
   SET duration = 'yearly'
 WHERE duration NOT IN ('lifetime','yearly')
   AND (
        name ILIKE '%yıllık%' OR name ILIKE '%yillik%'
     OR name ~* '(^|[^a-z0-9])[0-9]+\s*yıl($|[^a-z0-9])'
     OR name ~* '(^|[^a-z0-9])[0-9]+\s*yil($|[^a-z0-9])'
   );

-- 4) Flag email-bound licenses based on description hints
UPDATE public.products
   SET requires_email = true
 WHERE requires_email = false
   AND (
        description ILIKE '%mail adresin%'
     OR description ILIKE '%e-posta adresin%'
     OR description ILIKE '%eposta adresin%'
     OR description ILIKE '%hesabınıza tan%'
     OR description ILIKE '%hesabiniza tan%'
     OR description ILIKE '%hesabınıza ekl%'
     OR description ILIKE '%hesabiniza ekl%'
     OR description ILIKE '%mail tanımlı%'
     OR description ILIKE '%mail tanimli%'
     OR description ILIKE '%mail bağlı%'
     OR description ILIKE '%mail bagli%'
     OR description ILIKE '%davet gönder%'
     OR description ILIKE '%davet gonder%'
     OR description ILIKE '%invite%'
   );