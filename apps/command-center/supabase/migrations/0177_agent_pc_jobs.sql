-- 0177: PC jobs (docs/build-plans/hermes-ads.md).
--
-- The Ads Agent answers from the VPS, which is too small to render video. When
-- its turn asks for clip work (prepare, photo, preview, final), the VPS runner
-- queues a job here and waits; the PC runner claims it, does the work and
-- posts the result, and the VPS turn carries on. A job belongs to one running
-- Ads message and dies with it. Runner secret only, through
-- api/agent-runner/pc-job (lib/agentPcJobs.ts); no browser reads it.

create table if not exists public.agent_pc_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.agent_messages(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'video',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  host text,
  step text,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_pc_jobs_kind_check check (kind in ('video')),
  constraint agent_pc_jobs_status_check check (status in ('queued', 'running', 'done', 'error', 'cancelled'))
);

create index if not exists agent_pc_jobs_queued_idx on public.agent_pc_jobs (status, created_at);

alter table public.agent_pc_jobs enable row level security;
