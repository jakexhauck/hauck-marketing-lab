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

-- The daily caps live here, not only in the app: the app's count-then-insert
-- can race, the database cannot. 100 notes a day across all clients, 20 for any
-- one client. The advisory lock makes concurrent inserts take turns.
create or replace function public.grok_notes_cap() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('grok_notes_cap'));
  if (select count(*) from public.grok_notes where created_at > now() - interval '1 day') >= 100 then
    raise exception 'grok_notes: daily cap of 100 notes reached';
  end if;
  if (select count(*) from public.grok_notes where tenant_id = new.tenant_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'grok_notes: daily cap of 20 notes for this client reached';
  end if;
  return new;
end;
$$;

drop trigger if exists grok_notes_cap on public.grok_notes;
create trigger grok_notes_cap before insert on public.grok_notes
  for each row execute function public.grok_notes_cap();
