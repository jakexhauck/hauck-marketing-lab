-- 0135: the post-call form moves into the Command Center.
--
-- The GHL disposition form (0122) was never submitted once: its link reached
-- one meeting in twenty-three, because the workflow that stamped it rarely
-- fired. Sales Data now opens the same fields in the app and saves them onto
-- the meeting directly.
--
-- disposition_status -- the form's Status answer as a key: pif, deposit,
--                       noclose, noshow, followup, unqualified, cancelled.
--                       '' until the form is saved. Kept apart from outcome
--                       for two reasons: PIF and Deposit are both outcome
--                       'closed' and the form must reopen showing which, and
--                       Cancelled has no outcome at all. A form-cancelled
--                       meeting reads off THIS column, which the calendar
--                       sync never writes, so a sync can no longer flip it
--                       back to confirmed.
-- excluded_at        -- set when Jake exits a meeting out of the numbers (a
--                       test booking, a friend, an internal call). Null is a
--                       real sales call. The sync never touches it, so an
--                       exited meeting stays out however often it re-reads
--                       the calendar.
--
-- post_call_form_url is left in place and no longer read; dropping a column
-- is its own decision.
--
-- Idempotent: safe to re-run.

alter table public.sales_calls
  add column if not exists disposition_status text not null default '',
  add column if not exists excluded_at timestamptz;

alter table public.sales_calls
  drop constraint if exists sales_calls_disposition_status_check;
alter table public.sales_calls
  add constraint sales_calls_disposition_status_check
  check (disposition_status in
    ('', 'pif', 'deposit', 'noclose', 'noshow', 'followup', 'unqualified', 'cancelled'));

comment on column public.sales_calls.disposition_status is
  'Status answer from the in-app post-call form. Never written by the calendar sync.';
comment on column public.sales_calls.excluded_at is
  'When this meeting was exited out of the sales numbers. Null = counted.';
