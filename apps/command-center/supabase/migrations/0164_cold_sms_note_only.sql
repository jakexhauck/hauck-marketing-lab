-- 0164: a note with no follow-up date (Jake, 2026-10-13: "i dont need to put a
-- date and time with a note"). A row with no follow_up_on is a plain note on the
-- prospect: shown on the card, no GHL task. Idempotent.

alter table public.cold_sms_followups alter column follow_up_on drop not null;
