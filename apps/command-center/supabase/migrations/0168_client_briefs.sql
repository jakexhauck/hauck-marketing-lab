-- 0168: the Client Brief (Jake, 2026-10-17). docs/build-plans/agents.md, Phase 6.
--
-- One living brief per client, shared by every agent: one row per (client,
-- section), and a section is an agent id (the Manager's is "Status"). Jake
-- edits any section from the app; an agent writes only its own, through
-- POST /api/agent-runner/brief, which takes the section from the agent's chat
-- on the server and never from the request.
--
-- version is the lock. Every save names the version it read and bumps it by
-- one; a save naming an older version is refused (409) with the current row,
-- so neither Jake nor an agent can overwrite text they never saw.
--
-- client_brief_drive is where the brief's Google Doc lives ("Brief" in the
-- client's Drive folder) and how the last sync went. The Doc is rewritten in
-- place after every save, so its link never changes.
--
-- Service-role only (RLS on, no policies). Idempotent.

create table if not exists public.client_briefs (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  section     text not null check (section in ('manager','research','ads','creative','landing','ghl','reporting')),
  body        text not null default '',
  version     integer not null default 1 check (version >= 1),
  -- 'jake' or the agent id that wrote it.
  updated_by  text not null check (updated_by in ('jake','manager','research','ads','creative','landing','ghl','reporting')),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, section)
);

create table if not exists public.client_brief_drive (
  tenant_id   uuid primary key references public.tenants (id) on delete cascade,
  doc_id      text,
  doc_url     text,
  -- Sum of the section versions the Doc was last written from. Each save adds
  -- one, so it only grows, and a sync that finds it moved under it writes again.
  revision    integer not null default 0,
  synced_at   timestamptz,
  -- Why the last sync failed, or null when it worked. Shown on the Drive chip.
  error       text,
  updated_at  timestamptz not null default now()
);

alter table public.client_briefs enable row level security;
alter table public.client_brief_drive enable row level security;

-- The touch function is 0166's.
drop trigger if exists client_briefs_touch on public.client_briefs;
create trigger client_briefs_touch before update on public.client_briefs
  for each row execute function public.touch_agent_row();
drop trigger if exists client_brief_drive_touch on public.client_brief_drive;
create trigger client_brief_drive_touch before update on public.client_brief_drive
  for each row execute function public.touch_agent_row();
