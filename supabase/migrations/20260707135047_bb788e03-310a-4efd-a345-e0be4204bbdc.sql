
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

-- Mark AI heroes as featured
UPDATE public.products SET featured = true WHERE slug IN (
  'chatgpt-plus-1-ay'
) OR category IN ('ChatGPT', 'Google Gemini', 'Midjourney', 'Ideogram');
