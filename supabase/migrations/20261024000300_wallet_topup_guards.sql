-- Topup geçmişini bozmaz; hızlı doğrulama ve gelecekteki çift-onay kontrollerini destekler.
CREATE INDEX IF NOT EXISTS wallet_transactions_topup_idx
  ON public.wallet_transactions (topup_id)
  WHERE topup_id IS NOT NULL;

-- Eski duplicate kayıtları varsa migration'ı düşürmek yerine mevcut veriyi olduğu
-- gibi bırakır; duplicate olmayan ortamlarda gelecekteki çift ledger kaydını engeller.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wallet_transactions
    WHERE topup_id IS NOT NULL AND kind = 'topup'
    GROUP BY topup_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_topup_unique
      ON public.wallet_transactions (topup_id)
      WHERE topup_id IS NOT NULL AND kind = 'topup';
  END IF;
END $$;
