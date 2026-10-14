-- 0009: per-client subdomain + per-client owner password.
--
-- Moves two things off Cloudflare env vars and into the tenant row so one
-- deployment can serve many clients, each on its own subdomain, configured
-- entirely from the admin console:
--   subdomain          - the leftmost host label that routes to this client
--                        (e.g. 'williswindows' for williswindows.dashmarketing.com).
--   owner_password_hash - the owner login password for this client (PBKDF2,
--                        same format as staff_accounts.password_hash). Null =>
--                        fall back to the APP_PASSWORD env var (single-tenant
--                        deploys keep working unchanged).
--
-- GHL creds already live on tenants (ghl_location_id, ghl_token); 0009 does not
-- change them. The runtime starts reading them from here once a subdomain
-- resolves a tenant (see functions/lib/tenantResolve.ts), with the env vars as
-- the fallback so nothing breaks before a client is fully wired.

alter table public.tenants
  add column if not exists subdomain text,
  add column if not exists owner_password_hash text;

-- A subdomain routes to exactly one client. Case-insensitive uniqueness, and
-- only over rows that set one (many nulls are fine).
create unique index if not exists tenants_subdomain_key
  on public.tenants (lower(subdomain))
  where subdomain is not null;
