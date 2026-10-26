-- Facts the Grok Bots save about a client (docs/build-plans/grok-bot-connector.md).
--
-- The Hauck Brain connector's only write. Every bot sees the newest notes in
-- get_client on its next call. Written and read by the service role only, so
-- RLS is on with no policies.
create table if not exists public.grok_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  bot         text not null,
  note        text not null check (char_length(note) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index if not exists grok_notes_tenant_created on public.grok_notes (tenant_id, created_at desc);
create index if not exists grok_notes_created on public.grok_notes (created_at desc);

alter table public.grok_notes enable row level security;
