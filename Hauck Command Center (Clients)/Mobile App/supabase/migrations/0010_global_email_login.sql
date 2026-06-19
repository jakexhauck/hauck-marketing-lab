-- 0010: account-based login.
--
-- The Command Center serves every client from ONE url; there are no per-client
-- subdomains. The login email therefore identifies the client, which means an
-- email must map to exactly one staff account across ALL tenants (not just
-- within one, as 0007 enforced). An owner is just a staff_accounts row with
-- role 'owner', so this covers owners and staff alike.

-- Guard: refuse to apply if an email already spans tenants. Without this, the
-- global unique index below would fail with a generic error; here we name the
-- offending email so it can be resolved first. (No duplicates => no-op.)
do $$
declare
  dup text;
begin
  select lower(email) into dup
  from public.staff_accounts
  group by lower(email)
  having count(*) > 1
  limit 1;
  if dup is not null then
    raise exception
      'staff_accounts: email % exists in more than one tenant; resolve before global-unique login can apply', dup;
  end if;
end $$;

-- Replace the per-tenant uniqueness with global uniqueness on the login email.
drop index if exists public.staff_accounts_tenant_email;

create unique index if not exists staff_accounts_email_global
  on public.staff_accounts (lower(email));
