-- 0166: the Agents section (Jake, 2026-10-17). docs/build-plans/agents.md.
--
-- Seven service-delivery agents per client, chatted with from the admin
-- console and answered by `claude -p` on Jake's PC. The app keeps the chats,
-- the messages (a queued 'me' message is the job the PC runner claims), the
-- Building cards and requests between agents, and a MIRROR of the brains. The
-- brains themselves are Obsidian notes in the vault; the PC runner is their
-- only writer, so a lesson edited in the app is queued in agent_lesson_edits
-- and applied there.
--
-- tenant_id null means the agency itself: the Manager Agent on the agency rail.
--
-- Service-role only (RLS on, no policies). Idempotent.

create table if not exists public.agent_chats (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid references public.tenants (id) on delete cascade,
  agent              text not null check (agent in ('manager','research','ads','creative','landing','ghl','reporting')),
  -- Jake is the only user today; kept so a team can be added without a rebuild.
  user_id            uuid,
  title              text not null default 'New chat',
  -- Opened by a startup check rather than by Jake.
  auto               boolean not null default false,
  -- The Claude Code session this chat resumes. `started` flips after the first
  -- turn, so the runner knows --session-id from --resume.
  claude_session_id  uuid not null default gen_random_uuid(),
  started            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists agent_chats_scope_idx
  on public.agent_chats (tenant_id, agent, updated_at desc);

create table if not exists public.agent_messages (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references public.agent_chats (id) on delete cascade,
  role         text not null check (role in ('me','ai','request')),
  body         text not null default '',
  -- ai: { tools, used, learned, replyTo }. request: { itemId, fromAgent }.
  meta         jsonb not null default '{}'::jsonb,
  status       text not null default 'done' check (status in ('queued','running','done','error')),
  host         text,
  error        text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists agent_messages_chat_idx
  on public.agent_messages (chat_id, created_at);
create index if not exists agent_messages_queued_idx
  on public.agent_messages (created_at) where status = 'queued';

create table if not exists public.agent_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants (id) on delete cascade,
  agent        text not null check (agent in ('manager','research','ads','creative','landing','ghl','reporting')),
  chat_id      uuid references public.agent_chats (id) on delete set null,
  -- Set when another agent asked for this: a Request card in `agent`'s chat.
  from_agent   text check (from_agent in ('manager','research','ads','creative','landing','ghl','reporting')),
  kind         text not null default 'work',
  title        text not null,
  status       text not null default 'building' check (status in ('building','needs_ok','live','done','declined')),
  payload      jsonb not null default '{}'::jsonb,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists agent_items_scope_idx
  on public.agent_items (tenant_id, agent, updated_at desc);

create table if not exists public.agent_lessons (
  -- The Obsidian block id on the lesson line, e.g. l-3fa9c021.
  id          text primary key,
  scope       text not null check (scope in ('client','agent','manager')),
  tenant_id   uuid references public.tenants (id) on delete cascade,
  agent       text not null,
  text        text not null,
  source      text not null default '',
  learned_on  date,
  synced_at   timestamptz not null default now()
);

create index if not exists agent_lessons_scope_idx
  on public.agent_lessons (scope, tenant_id, agent);

create table if not exists public.agent_lesson_edits (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   text not null,
  action      text not null check (action in ('edit','delete')),
  text        text,
  status      text not null default 'queued' check (status in ('queued','applied')),
  created_at  timestamptz not null default now()
);

create table if not exists public.agent_runner_state (
  host             text primary key,
  last_seen_at     timestamptz not null default now(),
  last_monitor_at  timestamptz
);

alter table public.agent_chats enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_items enable row level security;
alter table public.agent_lessons enable row level security;
alter table public.agent_lesson_edits enable row level security;
alter table public.agent_runner_state enable row level security;

-- updated_at by trigger, so the runner's stale-message sweep can trust it.
create or replace function public.touch_agent_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists agent_chats_touch on public.agent_chats;
create trigger agent_chats_touch before update on public.agent_chats
  for each row execute function public.touch_agent_row();
drop trigger if exists agent_messages_touch on public.agent_messages;
create trigger agent_messages_touch before update on public.agent_messages
  for each row execute function public.touch_agent_row();
drop trigger if exists agent_items_touch on public.agent_items;
create trigger agent_items_touch before update on public.agent_items
  for each row execute function public.touch_agent_row();
