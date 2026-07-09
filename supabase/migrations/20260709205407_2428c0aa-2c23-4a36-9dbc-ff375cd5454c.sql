-- Referans sahibi, davet ettiği kullanıcıları (referred_by = kendisi) görebilsin
CREATE POLICY "Referrer can read invited profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (referred_by = auth.uid());