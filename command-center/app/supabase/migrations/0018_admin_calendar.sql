-- 0018: Admin calendar. Work blocks Jake paints on the month grid, plus the
-- singleton Google Calendar connection (one agency Google account, OAuth refresh
-- token), mirroring drive_connection (0015). Service-role only, RLS on, no
-- policies. Run AFTER 0017. Idempotent.

create table if not exists public.work_blocks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  -- Category key: deep | client | admin | off (rendered to a color client-side).
  color           text not null default 'deep',
  -- Set when the block has been mirrored to Google; null when sync is off/failed.
  google_event_id text,
  created_by      uuid references public.admin_accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists work_blocks_starts_at_idx on public.work_blocks (starts_at);

alter table public.work_blocks enable row level security;
-- No policies: reachable only via the service-role client in Functions.

create table if not exists public.calendar_connection (
  id                       boolean primary key default true,
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  connected_email          text,
  scope                    text,
  google_calendar_id       text not null default 'primary',
  connected_by             uuid references public.admin_accounts(id) on delete set null,
  updated_at               timestamptz not null default now(),
  constraint calendar_connection_singleton check (id = true)
);

alter table public.calendar_connection enable row level security;
-- No policies: reachable only via the service-role client in Functions.
