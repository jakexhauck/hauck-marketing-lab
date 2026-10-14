-- 0141: client_copy (the texts Claude writes per client) and ai_runs (every
-- Claude call, so spend is visible).
--
-- client_copy: one row per client per kind.
--   ltn       the four Long Term Nurture texts (client > GHL > Follow-up Texts)
--   lead_fu   the per-client lead form follow-ups: first text, SMS 3, Hail Mary
--             (Jake, 2026-10-06: the rest stay universal in the GHL snapshot)
-- items is [{ key, text }] plus any per-kind settings (lead_fu keeps the photo
-- choice). Text only, rendered as text, never HTML.
--
-- Run AFTER 0001..0140. Idempotent: safe to re-run. Service role only.

create table if not exists public.client_copy (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  kind       text not null check (kind in ('ltn', 'lead_fu')),
  items      jsonb not null default '[]'::jsonb,
  settings   jsonb not null default '{}'::jsonb,
  written_at timestamptz,
  edited_at  timestamptz,
  primary key (tenant_id, kind)
);
alter table public.client_copy enable row level security;

create table if not exists public.ai_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete set null,
  kind          text not null,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  ok            boolean not null,
  error         text,
  created_at    timestamptz not null default now()
);
alter table public.ai_runs enable row level security;
create index if not exists ai_runs_created_idx on public.ai_runs (created_at desc);
