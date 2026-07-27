-- 0057: when each cold caller is available to dial (Acquisition > Cold Call).
--
-- Agency-global, like every other cold-call table: NO tenant_id. A row belongs
-- to an agency login (admin_accounts, 0047 gave those rows a role), because the
-- question this answers is "when is Zach on the phones", not "when is this
-- client's staff working".
--
-- ONE ROW PER PERSON PER DAY, holding that day's half-hour slots as an array.
-- The obvious alternative (one row per slot) was rejected: a day is edited as a
-- whole when someone paints a range, and Supabase's REST client has no
-- transaction, so a delete-then-insert of 20 rows can leave a half-erased day
-- behind if the second call fails. An array is one upsert, so a day is either
-- the old shape or the new one and never a torn mixture of both.
--
-- `slots` holds 30-minute indices from local midnight: 0 = 00:00, 16 = 08:00,
-- 47 = 23:30. Storing the index rather than a timestamp keeps the rendered
-- window (currently 08:00-20:00) a UI decision, so widening the grid later needs
-- no migration and rewrites no rows.
--
-- The day and the slots are the AGENCY's local clock (functions/lib/agencyGhl.ts
-- owns that timezone), not UTC and not the browser's. A caller in another
-- timezone still marks the hours the prospects are awake, which is the only
-- reading of "available to cold call" that means anything.
--
-- An empty array is a real answer: "asked, and not available that day". The row
-- is kept rather than deleted so a cleared day is distinguishable from a day
-- nobody has filled in yet.
--
-- Run AFTER 0001..0056. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.cold_call_availability (
  admin_id   uuid not null references public.admin_accounts(id) on delete cascade,
  day        date not null,
  slots      smallint[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (admin_id, day)
);

-- The grid always reads a week window for one person: [monday, sunday].
create index if not exists cold_call_availability_admin_day_idx
  on public.cold_call_availability (admin_id, day);

-- The owner's coverage question ("who is on the phones Tuesday?") reads a date
-- range across everyone, which the primary key cannot serve on its own.
create index if not exists cold_call_availability_day_idx
  on public.cold_call_availability (day);

alter table public.cold_call_availability enable row level security;
-- No policies: service-role only, same as the rest of the cold-call tables.
