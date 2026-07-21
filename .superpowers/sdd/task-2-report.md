# Task 2 report: setter_dials migration

## Migration number chosen: 0040 (not 0027)

The brief assumed the current max migration was 0026, so the next would be 0027.
That assumption was stale. Listing the actual migrations directory in this
worktree:

```
$ ls command-center/app/supabase/migrations/ | sort
...
0026_tenant_ga4_property.sql
0027_client_ad_creatives.sql
0028_tenant_website_pages.sql
0029_customer_jobs.sql
0030_business_health.sql
0030_sales_data.sql   <- duplicate 0030, same as the known duplicate 0012
0031_scaling_calculator.sql
0032_time_audit_blocks.sql
0033_admin_task_status.sql
0034_leads.sql
0035_cold_calls.sql
0036_cold_sms_tracker.sql
0037_client_billing.sql
0038_ad_tracking.sql
0039_meta_ad_days.sql
```

True max is `0039_meta_ad_days.sql`. `0027` was already taken by
`client_ad_creatives.sql`, and there is also an existing `0012` duplicate
(`0012_admin_tasks.sql` / `0012_webhook_idempotency.sql`) and a `0030`
duplicate, confirming the brief's warning that numbering collides here.

Used **0040** as the next free number:
`command-center/app/supabase/migrations/0040_setter_dials.sql`

## Convention check against 0026, 0035, 0036, 0039

Read `0026_tenant_ga4_property.sql` (an ALTER, not directly comparable for
table-creation conventions) plus `0035_cold_calls.sql`, `0036_cold_sms_tracker.sql`,
and `0039_meta_ad_days.sql` (all CREATE TABLE, closer analogues).

Convention confirmed and followed exactly:
- `create table if not exists public.<name> (...)`, `id uuid primary key
  default gen_random_uuid()`.
- `tenant_id uuid not null references public.tenants(id) on delete cascade`
  (matches `meta_ad_days`).
- `alter table public.<name> enable row level security;` immediately after
  the `create table`, followed by a comment `-- No policies: service-role
  only.` (or the equivalent explanation). No policies are created, matching
  every reviewed migration.
- `create index if not exists <table>_<cols>_idx on public.<table> (...)`
  naming pattern, with a one-line comment above each index explaining the
  query shape it serves (matches `meta_ad_days_tenant_date_idx` etc.).
- Header comment block explaining WHY the table exists, one row = what,
  append-only reasoning, and a `Run AFTER 0001..NNNN. Idempotent: safe to
  re-run.` closing line, matching every reviewed migration's header style.

One deliberate deviation from the brief's literal SQL text: I moved the
`alter table ... enable row level security` line to sit directly after the
`create table` block and before the indexes, matching the exact statement
order used in `0039_meta_ad_days.sql`. The brief's SQL put RLS after the
indexes; functionally identical, reordered only for convention consistency.

The brief's table shape matches `setterMetrics.ts`'s `DialRow` type exactly:
`contact_id` (text), `dialed_at` (timestamptz), `spoke` (boolean), `outcome`
(text). No mismatch found.

## Migration file (final)

`command-center/app/supabase/migrations/0040_setter_dials.sql`:

```sql
-- 0040: setter_dials, one row per phone dial for the Setter Suite.
--
-- Every per-lead field the Setter board shows (attempt count, first call time,
-- whether anyone was reached, latest outcome) and every headline rate is
-- DERIVED from this table by functions/lib/setterMetrics.ts, never stored
-- redundantly. Append-only by design so history is never lost: a dial is a
-- fact that already happened and is never edited or deleted after the fact.
--
-- tenant_id scopes a dial to the client whose leads were being worked, same
-- pattern as meta_ad_days. contact_id/opportunity_id are GHL ids (text, not
-- uuid) matching how the rest of this codebase references GHL records.
--
-- outcome is constrained to the fixed set the setter UI offers; a raw text
-- column with a check constraint keeps it simple to query while still
-- rejecting typos at write time.
--
-- Run AFTER 0001..0039. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated
-- in _middleware.ts).

create table if not exists public.setter_dials (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  contact_id     text not null,
  opportunity_id text,
  pipeline_name  text,
  stage_name     text,
  dialed_at      timestamptz not null default now(),
  spoke          boolean not null default false,
  outcome        text not null check (outcome in
                   ('booked','not_interested','no_answer','reschedule','bad_lead')),
  note           text,
  tags_applied   jsonb not null default '[]'::jsonb,
  created_by     uuid references public.admin_accounts(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.setter_dials enable row level security;
-- No policies: service-role only.

-- The board and cockpit both query by tenant then contact.
create index if not exists setter_dials_tenant_contact_idx
  on public.setter_dials (tenant_id, contact_id, dialed_at desc);

-- The metrics roll-up scans a tenant over a date range.
create index if not exists setter_dials_tenant_dialed_idx
  on public.setter_dials (tenant_id, dialed_at desc);
```

## Environment setup needed before migrating

This worktree had no `command-center/app/.env.local` (it is gitignored and
worktrees do not share untracked files). Copied it byte-for-byte from
`C:\Users\games\Desktop\hauck-marketing-lab\command-center\app\.env.local`
via `cp`, which carries the `SUPABASE_ACCESS_TOKEN` the migrate script needs.
Confirmed it is still gitignored in this worktree:

```
$ git check-ignore -v command-center/app/.env.local
command-center/app/.gitignore:4:*.local	command-center/app/.env.local
```

## Commands run and output

### Apply

```
$ cd command-center/app && npm run db:migrate

> client-dashboard@0.1.0 db:migrate
> node scripts/db-migrate.mjs

→ Project: aroapsjifblscheshmst
→ Applying 0040_setter_dials.sql ... ok
✓ Applied 1 migration(s).
```

Only `0040_setter_dials.sql` was applied. No other pending migration existed
in the tree, so nothing else ran against production.

### Idempotency re-run

```
$ npm run db:migrate

> client-dashboard@0.1.0 db:migrate
> node scripts/db-migrate.mjs

→ Project: aroapsjifblscheshmst
✓ Database is up to date. Nothing to apply.
```

Clean skip, no error, as required.

## Live schema verification

Queried the live database directly through the same Supabase Management API
mechanism `db-migrate.mjs` uses (a one-off script, not committed, run then
deleted), rather than trusting the migrate script's own "ok" output.

Columns (`information_schema.columns`):

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | (none) |
| contact_id | text | NO | (none) |
| opportunity_id | text | YES | (none) |
| pipeline_name | text | YES | (none) |
| stage_name | text | YES | (none) |
| dialed_at | timestamp with time zone | NO | now() |
| spoke | boolean | NO | false |
| outcome | text | NO | (none) |
| note | text | YES | (none) |
| tags_applied | jsonb | NO | '[]'::jsonb |
| created_by | uuid | YES | (none) |
| created_at | timestamp with time zone | NO | now() |

Indexes (`pg_indexes`):
- `setter_dials_pkey`: `CREATE UNIQUE INDEX setter_dials_pkey ON public.setter_dials USING btree (id)`
- `setter_dials_tenant_contact_idx`: `CREATE INDEX ... USING btree (tenant_id, contact_id, dialed_at DESC)`
- `setter_dials_tenant_dialed_idx`: `CREATE INDEX ... USING btree (tenant_id, dialed_at DESC)`

Check constraint (`pg_constraint`):
- `setter_dials_outcome_check`: `CHECK ((outcome = ANY (ARRAY['booked'::text, 'not_interested'::text, 'no_answer'::text, 'reschedule'::text, 'bad_lead'::text])))`

RLS (`pg_class`):
- `relrowsecurity = true`, `relforcerowsecurity = false` (RLS on, not forced
  for table owner, matching every other table in this codebase since the
  service-role client bypasses RLS anyway).

This matches the migration file exactly, confirmed against the live database,
not assumed from the migrate script's exit status.

## Constraint rejection test

Ran, inside a single request containing `begin; insert ...; rollback;`, an
insert with `outcome = 'this_is_not_valid'`:

```
=== constraint rejection test (transaction, rolled back) ===
EXPECTED REJECTION: 400 Failed to run sql query: ERROR:  23514: new row for
relation "setter_dials" violates check constraint "setter_dials_outcome_check"
DETAIL:  Failing row contains (7988e3e4-81c1-4984-9d53-58eac7b9ef63,
00000000-0000-0000-0000-000000000000, test-contact, null, null, null,
2026-07-20 18:52:19.271854+00, f, this_is_not_valid, null, [], null,
2026-07-20 18:52:19.271854+00).
```

The insert was rejected by Postgres before it could commit. Followed with a
`select count(*) where contact_id = 'test-contact'` against the live table,
which returned `0`, confirming no test data was left behind.

## Concerns

- Migration numbering in this repo is genuinely unreliable: two separate
  duplicate numbers already exist (`0012`, `0030`) in addition to the brief's
  own stale assumption about `0027`. Anyone picking a number by reading a
  spec doc rather than the live directory listing will collide. Worth a
  standing rule to always `ls | sort | tail` immediately before naming a new
  migration file, which is exactly what this task's instructions already
  enforced.
- No other concerns. The migration is purely additive (new table, RLS
  enabled with no policies, two new indexes), matches the existing table
  conventions in this codebase, matches the shape `setterMetrics.ts`
  consumes, was applied exactly once, is idempotent, and its live shape and
  constraint behavior were independently verified against the production
  database rather than assumed from tool output.
