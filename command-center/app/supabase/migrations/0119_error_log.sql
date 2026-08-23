-- Background failures become rows, not console noise.
--
-- Every fire-and-forget side effect (calendar mirror, CAPI report, push,
-- confirmation flip) and every uncaught handler error was a console.error
-- inside an isolate: invisible unless someone happened to be tailing logs,
-- which nobody is. This table is the receipt drawer. lib/errorLog.ts writes
-- best-effort (a logging failure must never become THE failure), and the
-- admin errors API plus the health probe read it back.
--
-- Retention is handled by opportunistic deletion on write (same pattern as
-- login_attempts): rows older than 14 days carry no operational signal.
--
-- Additive and idempotent.

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  message text not null,
  context jsonb
);

create index if not exists error_log_created_idx
  on public.error_log (created_at desc);
create index if not exists error_log_source_idx
  on public.error_log (source, created_at desc);

alter table public.error_log enable row level security;

comment on table public.error_log is
  'Best-effort receipts for background failures. Written by lib/errorLog.ts; surfaced in the admin errors API and the connection-health probe.';
