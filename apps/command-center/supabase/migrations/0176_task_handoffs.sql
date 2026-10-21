-- 0176: task handoffs (Jake, 2026-10-20; docs/build-plans/four-agents-and-handoffs.md, Build B).
--
-- A Director task can wait on others (waits_on, task keys of the same client).
-- When all of them are done or cut, the task's agent is started on its own
-- with what they produced (outputs). mode is the per-task switch: 'ask' (every
-- write on a card Jake approves, the default) or 'live' (GHL writes without a
-- card, for that task's turn only). Nothing waits on anything until Jake or the
-- CSM sets it, so existing clients change nothing until then.
--
-- Director turns post a new message role, 'trigger', which no write gate reads
-- as Jake's ask.

alter table public.client_tasks
  add column if not exists waits_on text[] not null default '{}',
  add column if not exists mode text not null default 'ask',
  add column if not exists outputs jsonb not null default '{}'::jsonb;

alter table public.client_tasks drop constraint if exists client_tasks_mode_check;
alter table public.client_tasks add constraint client_tasks_mode_check check (mode in ('ask', 'live'));

alter table public.agent_messages drop constraint if exists agent_messages_role_check;
alter table public.agent_messages add constraint agent_messages_role_check
  check (role in ('me', 'ai', 'request', 'trigger'));
