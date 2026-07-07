INSERT INTO public.products (name, slug, description, duration, price_try, active)
VALUES (
  'Canva Pro Ömürlük',
  'canva-pro-omurluk',
  'Canva Pro ömürlük lisans — sınırsız Pro şablon, arka plan kaldırıcı, marka kiti, Magic Studio AI araçları ve 100+ GB bulut depolama. Anlık teslim, değişim garantisi.',
  'lifetime',
  300,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  duration = EXCLUDED.duration,
  price_try = EXCLUDED.price_try,
  active = true;