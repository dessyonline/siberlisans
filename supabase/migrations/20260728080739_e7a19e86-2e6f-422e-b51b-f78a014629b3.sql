ALTER TABLE public.products ADD COLUMN IF NOT EXISTS demo_video_url text;

CREATE TABLE IF NOT EXISTS public.product_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question text NOT NULL,
  answer text,
  answered_by uuid,
  answered_at timestamptz,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_questions_product ON public.product_questions(product_id, created_at DESC);

GRANT SELECT, INSERT ON public.product_questions TO authenticated;
GRANT UPDATE, DELETE ON public.product_questions TO authenticated;
GRANT SELECT ON public.product_questions TO anon;
GRANT ALL ON public.product_questions TO service_role;

ALTER TABLE public.product_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read answered questions"
  ON public.product_questions FOR SELECT
  USING (is_public = true AND answer IS NOT NULL);

CREATE POLICY "users read own questions"
  ON public.product_questions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admins read all questions"
  ON public.product_questions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users can ask"
  ON public.product_questions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND answer IS NULL);

CREATE POLICY "admins can update questions"
  ON public.product_questions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete questions"
  ON public.product_questions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_product_questions_updated
  BEFORE UPDATE ON public.product_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();