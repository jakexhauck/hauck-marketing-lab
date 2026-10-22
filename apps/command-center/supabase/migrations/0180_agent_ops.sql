-- Each agent's settings: cost, health, schedules and memory
-- (docs/build-plans/hermes-agent-ops.md, Phase 4).
--
-- The runner on the VPS reads every Hermes profile's own API (sessions, health,
-- jobs) every ten minutes and posts it here (POST /api/agent-runner/agent-ops).
-- The app never talks to Hermes: it reads these tables, and a pause or run of a
-- scheduled job is queued here for the runner to carry out on its next post.

-- The latest read of one agent. One row per agent, replaced each time.
create table if not exists public.agent_ops (
  agent         text primary key,
  -- Hermes's /health/detailed, trimmed: status, gateway state, platform error.
  health        jsonb not null default '{}'::jsonb,
  -- Hermes's /api/jobs for that profile, as listed.
  jobs          jsonb not null default '[]'::jsonb,
  -- The skills the runner installed for it (deploy/vps/skills.json).
  skills        jsonb not null default '[]'::jsonb,
  collected_at  timestamptz not null default now()
);

-- Usage per agent per day (UTC), summed from Hermes's sessions. Rewritten whole
-- for the days the runner sends, so a session that grows is never counted twice.
create table if not exists public.agent_usage_daily (
  agent               text not null,
  day                 date not null,
  sessions            integer not null default 0,
  api_calls           integer not null default 0,
  input_tokens        bigint not null default 0,
  output_tokens       bigint not null default 0,
  cache_read_tokens   bigint not null default 0,
  cache_write_tokens  bigint not null default 0,
  -- Hermes's own estimate. The VPS runs on Jake's Claude subscription, so this
  -- is what the same work would cost on the API, not a bill.
  est_cost_usd        numeric(12, 4) not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (agent, day)
);

-- Jake's pause / resume / run of a scheduled job, waiting for the runner.
create table if not exists public.agent_ops_commands (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null,
  job_id      text not null,
  action      text not null check (action in ('pause', 'resume', 'run')),
  status      text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  result      text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);

create index if not exists agent_ops_commands_queued_idx on public.agent_ops_commands (status) where status = 'queued';

-- Memory: a lesson's kind and, once Jake corrects it, the lesson that replaced
-- it (projects/agent-runner/src/brain.ts). The brain file stays the truth; these
-- mirror it.
alter table public.agent_lessons add column if not exists kind text not null default 'lesson'
  check (kind in ('lesson', 'decision', 'fact'));
alter table public.agent_lessons add column if not exists replaced_by text;

alter table public.agent_ops enable row level security;
alter table public.agent_usage_daily enable row level security;
alter table public.agent_ops_commands enable row level security;
