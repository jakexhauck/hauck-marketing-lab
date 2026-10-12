-- 0158: Cold SMS > Pipeline (Jake, 2026-10-12).
--
-- cold_sms_reply_verdicts: Claude's read of a prospect's latest reply
-- (positive / negative / stop / check), one row per GHL contact. reply_key is
-- the newest inbound message's date in epoch ms: a new reply changes it and the
-- board asks Claude again; our own texts do not. Labels only, nothing here moves
-- a card.
--
-- Jake's Google Calendar for the booking wizard is NOT stored here: it rides the
-- existing Composio link (functions/lib/googleCalendar.ts) under its own agency
-- user id.
--
-- Service-role only (RLS on, no policies). Idempotent.

create table if not exists public.cold_sms_reply_verdicts (
  contact_id     text primary key,
  reply_key      text not null,
  reply_body     text not null default '',
  verdict        text not null check (verdict in ('positive', 'negative', 'stop', 'check')),
  classified_at  timestamptz not null default now()
);

alter table public.cold_sms_reply_verdicts enable row level security;
