-- 0170: the Director (Jake, 2026-10-18). docs/build-plans/director.md.
--
-- One SOP per agent that the agents actually run on. The Director page edits
-- WHAT gets done: stages (columns, Jake approves between them) and the tasks in
-- each, with who owns them. The SOPs page keeps the HOW: a task linked to a box
-- on the flow graph (node_id) takes its steps from src/lib/agentSops.ts; a task
-- Jake adds on the Director has no box, so its steps live in `how`, drafted by
-- Claude and held as 'draft' until Jake approves them on the SOPs page.
--
-- removed_at hides a task from the Director and the agents. A linked task is
-- never deleted, so its graph box can show as Off.
--
-- Agency wide (no tenant): one board for every client. Service-role only (RLS
-- on, no policies). Seeded once from the current graph. Idempotent.

create table if not exists public.agent_sop_stages (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null check (agent in ('manager','research','ads','creative','landing','ghl','reporting')),
  position    integer not null default 0,
  name        text not null check (length(name) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.agent_sop_tasks (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null check (agent in ('manager','research','ads','creative','landing','ghl','reporting')),
  stage_id    uuid not null references public.agent_sop_stages (id) on delete cascade,
  position    integer not null default 0,
  name        text not null check (length(name) between 1 and 120),
  owner       text not null check (owner in ('agent','jake','client')),
  node_id     text,
  how         text,
  how_status  text not null default 'set' check (how_status in ('set','draft')),
  removed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists agent_sop_tasks_node on public.agent_sop_tasks (agent, node_id) where node_id is not null;
create index if not exists agent_sop_tasks_stage on public.agent_sop_tasks (stage_id, position);
create index if not exists agent_sop_stages_agent on public.agent_sop_stages (agent, position);

alter table public.agent_sop_stages enable row level security;
alter table public.agent_sop_tasks enable row level security;

-- The touch function is 0166's.
drop trigger if exists agent_sop_stages_touch on public.agent_sop_stages;
create trigger agent_sop_stages_touch before update on public.agent_sop_stages
  for each row execute function public.touch_agent_row();
drop trigger if exists agent_sop_tasks_touch on public.agent_sop_tasks;
create trigger agent_sop_tasks_touch before update on public.agent_sop_tasks
  for each row execute function public.touch_agent_row();

-- Seed: every graph box that is a task (not an edit side door, not a handoff
-- to another agent), in the stages Jake approves between. Only on an empty
-- table, so a re-run never undoes his edits.
do $$
begin
  if not exists (select 1 from public.agent_sop_stages) then
    insert into public.agent_sop_stages (agent, position, name) values ('manager', 0, 'Onboarding');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 0), 0, 'Invoice paid', 'client', 'paid');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 0), 1, 'Contract signed', 'client', 'contract');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 0), 2, 'Onboarding prep', 'agent', 'prep');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 0), 3, 'Onboarding call', 'jake', 'call');
    insert into public.agent_sop_stages (agent, position, name) values ('manager', 1, 'Build');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 1), 0, 'Build', 'agent', 'build');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 1), 1, 'Pre-launch check', 'jake', 'check');
    insert into public.agent_sop_stages (agent, position, name) values ('manager', 2, 'Launch');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 2), 0, 'Launch call', 'jake', 'launch');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('manager', (select id from public.agent_sop_stages where agent = 'manager' and position = 2), 1, 'Ads LIVE', 'agent', 'live');
    insert into public.agent_sop_stages (agent, position, name) values ('ghl', 0, 'Account');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 0), 0, 'Sub-account', 'agent', 'sub');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 0), 1, 'Staff added', 'agent', 'staff');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 0), 2, 'Connect facebook', 'jake', 'fb');
    insert into public.agent_sop_stages (agent, position, name) values ('ghl', 1, 'Compliance');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 1), 0, 'Custom values', 'agent', 'cv');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 1), 1, 'A2P submitted', 'agent', 'a2p');
    insert into public.agent_sop_stages (agent, position, name) values ('ghl', 2, 'Phone and workflows');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 2), 0, 'Phone system', 'agent', 'phone');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 2), 1, 'Workflows', 'agent', 'wf');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 2), 2, 'CAPI workflows', 'agent', 'capi');
    insert into public.agent_sop_stages (agent, position, name) values ('ghl', 3, 'Review');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ghl', (select id from public.agent_sop_stages where agent = 'ghl' and position = 3), 0, 'Jake review', 'jake', 'review');
    insert into public.agent_sop_stages (agent, position, name) values ('ads', 0, 'Setup');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 0), 0, 'Dataset + pixel', 'jake', 'dataset');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 0), 1, 'Lead form draft', 'agent', 'form');
    insert into public.agent_sop_stages (agent, position, name) values ('ads', 1, 'Plan');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 1), 0, 'Campaign plan', 'agent', 'plan');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 1), 1, 'Ad copy', 'agent', 'copy');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 1), 2, 'Jake review', 'jake', 'review');
    insert into public.agent_sop_stages (agent, position, name) values ('ads', 2, 'Launch');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 2), 0, 'Build in Ads Manager', 'jake', 'build');
    insert into public.agent_sop_stages (agent, position, name) values ('ads', 3, 'Run');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 3), 0, 'Monitor', 'agent', 'monitor');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('ads', (select id from public.agent_sop_stages where agent = 'ads' and position = 3), 1, 'Recommend', 'agent', 'rec');
    insert into public.agent_sop_stages (agent, position, name) values ('creative', 0, 'Brief');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 0), 0, 'Brief', 'agent', 'brief');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 0), 1, 'Brief review', 'jake', 'breview');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 0), 2, 'Credit approval', 'jake', 'cost');
    insert into public.agent_sop_stages (agent, position, name) values ('creative', 1, 'Make');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 1), 0, 'Generate / edit', 'agent', 'make');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 1), 1, 'Raw footage', 'client', 'foot');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 1), 2, 'Transcribe + cut', 'agent', 'cut');
    insert into public.agent_sop_stages (agent, position, name) values ('creative', 2, 'Finish');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 2), 0, 'Preview review', 'jake', 'preview');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 2), 1, 'Final export', 'agent', 'final');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('creative', (select id from public.agent_sop_stages where agent = 'creative' and position = 2), 2, 'Media Library', 'agent', 'lib');
    insert into public.agent_sop_stages (agent, position, name) values ('landing', 0, 'Build');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('landing', (select id from public.agent_sop_stages where agent = 'landing' and position = 0), 0, 'Asset brief', 'agent', 'brief');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('landing', (select id from public.agent_sop_stages where agent = 'landing' and position = 0), 1, 'Recent work page', 'agent', 'rw');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('landing', (select id from public.agent_sop_stages where agent = 'landing' and position = 0), 2, 'Owner story page', 'agent', 'os');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('landing', (select id from public.agent_sop_stages where agent = 'landing' and position = 0), 3, 'Preview URL', 'agent', 'prev');
    insert into public.agent_sop_stages (agent, position, name) values ('landing', 1, 'Go live');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('landing', (select id from public.agent_sop_stages where agent = 'landing' and position = 1), 0, 'Jake review', 'jake', 'review');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('landing', (select id from public.agent_sop_stages where agent = 'landing' and position = 1), 1, 'Promote to live', 'agent', 'live');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('landing', (select id from public.agent_sop_stages where agent = 'landing' and position = 1), 2, 'In follow-up texts', 'agent', 'sms');
    insert into public.agent_sop_stages (agent, position, name) values ('research', 0, 'Research');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('research', (select id from public.agent_sop_stages where agent = 'research' and position = 0), 0, 'Onboarding form', 'client', 'form');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('research', (select id from public.agent_sop_stages where agent = 'research' and position = 0), 1, 'Pain points', 'agent', 'pain');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('research', (select id from public.agent_sop_stages where agent = 'research' and position = 0), 2, 'Local competitors', 'agent', 'comp');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('research', (select id from public.agent_sop_stages where agent = 'research' and position = 0), 3, 'Angles', 'agent', 'angles');
    insert into public.agent_sop_stages (agent, position, name) values ('research', 1, 'Finish');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('research', (select id from public.agent_sop_stages where agent = 'research' and position = 1), 0, 'Jake review', 'jake', 'review');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('research', (select id from public.agent_sop_stages where agent = 'research' and position = 1), 1, 'Into client brain', 'agent', 'brain');
    insert into public.agent_sop_stages (agent, position, name) values ('reporting', 0, 'Write');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('reporting', (select id from public.agent_sop_stages where agent = 'reporting' and position = 0), 0, 'Month closes', 'agent', 'close');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('reporting', (select id from public.agent_sop_stages where agent = 'reporting' and position = 0), 1, 'Pull numbers', 'agent', 'pull');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('reporting', (select id from public.agent_sop_stages where agent = 'reporting' and position = 0), 2, 'Explain the why', 'agent', 'why');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('reporting', (select id from public.agent_sop_stages where agent = 'reporting' and position = 0), 3, 'Write report', 'agent', 'write');
    insert into public.agent_sop_stages (agent, position, name) values ('reporting', 1, 'Send');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('reporting', (select id from public.agent_sop_stages where agent = 'reporting' and position = 1), 0, 'Jake review', 'jake', 'review');
    insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id) values ('reporting', (select id from public.agent_sop_stages where agent = 'reporting' and position = 1), 1, 'Sent to client', 'agent', 'send');
  end if;
end $$;
