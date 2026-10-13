-- 0161: Cold SMS > Pipeline follow-ups (Jake, 2026-10-13).
--
-- One follow-up day per prospect, set from the card's right-click menu. The day
-- is a calendar date in Jake's zone (AGENCY_TIMEZONE). A GHL task due 9am that
-- day is made on the contact too, so GHL reminds him; ghl_task_id is kept so a
-- changed or cleared follow-up removes the old task instead of leaving it.
--
-- Kept here, not read back from GHL tasks: the board would need one GHL call per
-- card to show the dates.
--
-- Service-role only (RLS on, no policies). Idempotent.

create table if not exists public.cold_sms_followups (
  contact_id    text primary key,
  follow_up_on  date not null,
  ghl_task_id   text,
  updated_at    timestamptz not null default now()
);

alter table public.cold_sms_followups enable row level security;
