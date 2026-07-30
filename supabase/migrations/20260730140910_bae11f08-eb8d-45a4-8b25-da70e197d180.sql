REVOKE ALL ON FUNCTION public.admin_dashboard_financials(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_profit_report(timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_profit_by_product(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_financials(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_profit_report(timestamptz, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_profit_by_product(timestamptz, timestamptz) TO authenticated, service_role;