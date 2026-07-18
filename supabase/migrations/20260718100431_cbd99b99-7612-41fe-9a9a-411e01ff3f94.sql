REVOKE ALL ON FUNCTION public.enforce_wallet_topup_spam_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_wallet_topup_spam_guard() TO service_role;