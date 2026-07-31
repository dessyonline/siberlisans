GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT ALL ON public.support_messages TO service_role;