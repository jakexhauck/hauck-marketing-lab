-- 0136: sales_calls.booked_by, which cold-call/book.ts has written all along.
--
-- The column was described (as "0073") but never created, so every upsert
-- from the in-app booking panel failed with 42703 and the meeting only reached
-- this table when the calendar sync adopted it later, with no booker and no
-- GoHighLevel tag result. Found 2026-10-01.
--
-- Who SET the appointment. Separate from logged_by, which the outcome record
-- overwrites with whoever answered for the meeting. Plain uuid, like logged_by.
--
-- Idempotent: safe to re-run.

alter table public.sales_calls add column if not exists booked_by uuid;
