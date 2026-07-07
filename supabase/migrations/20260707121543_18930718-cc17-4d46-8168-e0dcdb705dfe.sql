INSERT INTO public.products (name, slug, description, duration, price_try, active)
VALUES (
  'Lovable Sınırsız — Kredisiz',
  'lovable-sinirsiz-kredisiz',
  'Lovable sınırsız kullanım paketi — kredi limiti yok, tüm mesaj/oluşturma haklarınız açık. Ömürlük erişim, anlık teslim, değişim garantisi.',
  'lifetime',
  1250,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  duration = EXCLUDED.duration,
  price_try = EXCLUDED.price_try,
  active = true;