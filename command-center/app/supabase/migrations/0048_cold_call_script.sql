-- 0048: cold_call_script, the agency's own dialing script.
--
-- The Setter Suite has one script per client (0044, setter_scripts). Cold
-- calling is the agency prospecting for itself, so there is no client to key
-- on: exactly one script exists, and this table holds exactly one row, pinned
-- by a constant primary key.
--
-- Same trust boundary as 0044: the column holds sanitized HTML, and
-- functions/lib/setterScript.ts is the only way markup gets in. The read path
-- renders it verbatim on that guarantee, so no other writer may touch it.
--
-- Only an owner writes it (the Settings page inside Cold Calling); the cold
-- caller reads it in the floating script panel while dialing.
--
-- ACCEPTED LIMITATION: last write wins. One writer in practice.
--
-- Run AFTER 0001..0047. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated
-- in _middleware.ts, role gated in functions/lib/adminRoles.ts).

create table if not exists public.cold_call_script (
  -- One row, always. The check pins it: a second insert cannot invent an id.
  id         text primary key default 'agency' check (id = 'agency'),
  html       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_accounts(id) on delete set null
);

alter table public.cold_call_script enable row level security;
-- No policies: service-role only.

comment on table public.cold_call_script is
  'The single agency cold-calling script (Acquisition > Cold Call > Settings). Sanitized in functions/lib/setterScript.ts before every write.';
