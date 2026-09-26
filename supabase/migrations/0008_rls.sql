-- Deny-all row level security for the browser roles.
--
-- Every read and write goes through authenticated server routes that enforce ownership and
-- participation in SQL, so PostgREST must expose nothing. Enabling RLS with no policies plus
-- revoking table privileges achieves that for anon and authenticated.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke execute on function local_day_bounds(date, text) from public, anon, authenticated;
