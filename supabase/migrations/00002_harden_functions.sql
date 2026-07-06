-- Address security advisor findings: pin search_path and remove RPC exposure
-- of internal functions.

alter function public.set_updated_at() set search_path = public;

-- Trigger functions are invoked by the system, never via the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_role_change() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- is_admin() is evaluated inside RLS policies by the authenticated role, so it
-- must stay executable there; anon has no use for it.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
