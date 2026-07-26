-- 0049: assign a lead to the person who is going to call it.
--
-- The lead book (0034) had one owner column, admin_id, and it records who ADDED
-- the row. That is provenance, not work: with a caller on the phones, the
-- question the app has to answer is "whose list is this", and no column
-- answered it.
--
-- assigned_to is that answer. Null means unassigned: the row sits in Jake's book
-- and appears on nobody's queue. A cold caller's queue is exactly the rows
-- assigned to them, enforced in the handler rather than by the query the browser
-- happens to send.
--
-- on delete set null: disabling a caller's login must not delete their leads.
-- The work returns to the pool to be handed to whoever takes over.
--
-- Run AFTER 0001..0048. Idempotent: safe to re-run.

alter table public.leads
  add column if not exists assigned_to uuid
    references public.admin_accounts(id) on delete set null;

-- Every read of a caller's queue filters on this, so it carries the live-row
-- condition with it: a partial index on the rows that are not soft-deleted.
create index if not exists leads_assigned_idx
  on public.leads (assigned_to, created_at desc)
  where deleted_at is null;

comment on column public.leads.assigned_to is
  'The admin_accounts row whose queue this lead sits in. Null = unassigned, in the book but on nobody''s list. Distinct from admin_id, which records who added it.';
