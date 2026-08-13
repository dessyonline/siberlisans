-- Profiles tablosuna telegram_handle sütunu ekle
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_handle TEXT;

-- RLS: Kullanıcı kendi telegram handle'ını güncelleyebilir
-- Not: profiles tablosu için SELECT zaten authenticated için açık olabilir,
-- ama UPDATE kontrolü yapalım.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'profiles_self_update'
  ) THEN
    CREATE POLICY "profiles_self_update" ON public.profiles
      FOR UPDATE TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.telegram_handle IS 'Kullanıcının Telegram kullanıcı adı (@ işareti ile veya olmadan)';
