-- 0163: a note and an optional time on a Cold SMS follow-up (Jake, 2026-10-13:
-- "specific follow ups ... and a note"). Both show on the card; the note is the
-- GHL task's body and the time its due time (9am when none is given).
--
-- follow_up_time is a wall-clock "HH:MM" in Jake's zone, kept apart from the day
-- so a follow-up with no time stays a plain day. Idempotent.

alter table public.cold_sms_followups add column if not exists note text not null default '';
alter table public.cold_sms_followups add column if not exists follow_up_time text;
