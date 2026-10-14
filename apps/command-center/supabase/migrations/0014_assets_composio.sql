-- 0014: repoint the Assets Drive connection at Composio.
--
-- 0013 created drive_connection to hold a raw Google OAuth refresh token (the
-- standalone internal portal's approach). The internal portal is being folded
-- into the command center and the Drive integration now goes through Composio
-- (managed OAuth): the agency Google account is connected once via Composio and
-- the portal calls Composio's Drive actions. So we swap the token store for a
-- small Composio connection record.
--
-- The permission/mapping tables from 0013 are unchanged and carry over as-is:
--   client_folders, folder_access, drive_full_access.
--
-- drive_connection held no rows (no raw-OAuth connection was ever completed), so
-- dropping and recreating it is safe. Run AFTER 0013. Idempotent.
-- Service-role only (RLS on, no policies), same as the other admin tables.

drop table if exists public.drive_connection;

create table if not exists public.drive_connection (
  id                            boolean primary key default true,
  -- The Composio user_id the agency Google account is connected under.
  composio_user_id              text not null default 'hauck-agency',
  -- The resulting Composio connected account (ca_...) and the auth config (ac_...).
  composio_connected_account_id text,
  composio_auth_config_id       text,
  -- Display only: which Google account authorized.
  connected_email               text,
  -- pending | active | error. Mirrors Composio's connection status.
  status                        text not null default 'pending',
  connected_by                  uuid references public.admin_accounts(id) on delete set null,
  updated_at                    timestamptz not null default now(),
  constraint drive_connection_singleton check (id = true)
);

alter table public.drive_connection enable row level security;
-- No policies: reachable only via the service-role client in Functions.
