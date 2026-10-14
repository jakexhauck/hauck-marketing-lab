-- 0015: Assets connects Google Drive directly (OAuth), not via Composio.
--
-- Composio could browse Drive but could not transfer file bytes on this account
-- (its file-staging store returned "Missing presigned URL"), which is the core
-- of a files hub. So the Assets hub connects ONE agency Google account directly
-- via OAuth and streams bytes itself (no size cap). This swaps the Composio
-- connection record (0014) back to a refresh-token store.
--
-- The permission/mapping tables (client_folders, folder_access, drive_full_access)
-- are unchanged. drive_connection held no rows, so drop + recreate is safe.
-- Run AFTER 0014. Idempotent. Service-role only (RLS on, no policies).

drop table if exists public.drive_connection;

create table if not exists public.drive_connection (
  id                       boolean primary key default true,
  -- Long-lived OAuth refresh token for the agency Google account (server-only).
  refresh_token            text not null,
  -- Short-lived access token cache + expiry; refreshed on demand.
  access_token             text,
  access_token_expires_at  timestamptz,
  -- Display only: which Google account authorized.
  connected_email          text,
  scope                    text,
  connected_by             uuid references public.admin_accounts(id) on delete set null,
  updated_at               timestamptz not null default now(),
  constraint drive_connection_singleton check (id = true)
);

alter table public.drive_connection enable row level security;
-- No policies: reachable only via the service-role client in Functions.
