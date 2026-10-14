-- 0024: Website page — per-tenant published site URL + client change requests.
--
-- Two additive changes, both for the client-facing Website section:
--
--   tenants.website_url  the client's live site (the single site under their GHL
--                        Sites tab). Set per client in the admin view. Null =>
--                        the Website page shows its not-connected state. The app
--                        only ever DISPLAYS this URL (preview + open button); it
--                        is not a credential.
--
--   website_change_requests  the "Request a Change" board. A client drops a pin
--                        on their live site (page + device + x/y as percentages
--                        of the preview) and leaves a note. These rows are the
--                        single source of truth the future admin mirror reads, so
--                        the client's request and Jake's admin view stay in sync.
--
-- Run AFTER 0001..0023. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies),
-- matching admin_tasks / tour_progress.

alter table public.tenants
  add column if not exists website_url text;

create table if not exists public.website_change_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  -- Which site page the pin sits on (home/services/...); free text so it works
  -- before the funnels API lists real page slugs. Defaults to the home page.
  page        text not null default 'home',
  -- Which preview the pin was dropped on, so it lands correctly on replay.
  device      text not null default 'desktop',
  -- Pin position as percentages of the preview (0..100), device-independent.
  x_pct       real not null,
  y_pct       real not null,
  note        text not null,
  -- open | in_progress | done. Client creates 'open'; admin moves it later.
  status      text not null default 'open',
  -- Who filed it: a staff id ("staff:<id>") or an owner identity, best-effort.
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.website_change_requests enable row level security;

create index if not exists website_change_requests_tenant_idx
  on public.website_change_requests (tenant_id, created_at desc);
