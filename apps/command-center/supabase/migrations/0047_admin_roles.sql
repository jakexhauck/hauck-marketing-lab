-- 0047: Roles for agency logins (Admin > Team).
--
-- admin_accounts (0008) was built for one person: every row was a full
-- super-admin with cross-tenant authority over every client. Hiring anyone made
-- that a liability, so a login now carries a ROLE and the middleware gates
-- /api/admin/* on it.
--
-- Roles:
--   owner       - Jake. Everything, including this page.
--   cold_caller - agency prospecting only. No clients, no settings, no billing.
--   setter      - works a client's leads in the Setter Suite.
--
-- Existing rows are owners: the only accounts that exist today are Jake's, and
-- silently demoting a live login would lock him out of his own console.
--
-- last_login_at answers "is this person actually using it", which the roster
-- shows. Written on a successful admin login; null until they first sign in.
--
-- Run AFTER 0001..0046. Idempotent: safe to re-run.

alter table public.admin_accounts
  add column if not exists role text not null default 'owner';

alter table public.admin_accounts
  add column if not exists last_login_at timestamptz;

-- Added separately from the column so a re-run against an already-migrated
-- database does not trip over an existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_accounts_role_check'
  ) then
    alter table public.admin_accounts
      add constraint admin_accounts_role_check
      check (role in ('owner','cold_caller','setter'));
  end if;
end $$;

-- The roster lists everyone, oldest first, and is read on every page load.
create index if not exists admin_accounts_role_idx
  on public.admin_accounts (role);
