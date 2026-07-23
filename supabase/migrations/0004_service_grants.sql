-- The signup route handler (service role) shares the same Postgres token
-- bucket for IP rate limiting. service_role bypasses RLS but still needs
-- EXECUTE after 0003 revoked the default PUBLIC grant.
grant execute on function public.consume_token(text, numeric, numeric) to service_role;
grant execute on function public.audit(uuid, text, text, jsonb) to service_role;
