-- 0123: "Gatekeeper" is an outcome.
--
-- The front desk would not put us through. Until now the nearest button said
-- "Heard opener, said no", which records two things that never happened: that
-- the prospect heard the opener, and that they said no. Nobody we rang to speak
-- to had come to the phone at all.
--
-- Jake asked for it on 2026-08-25 to answer one question: how many gatekeepers
-- are we hitting. That number is the difference between a script that is not
-- working and a list we cannot get past, and neither of those is visible while
-- both are filed as an objection.
--
-- What it counts as (functions/lib/coldCallDials.ts, in one place):
--   a dial          yes. A real prospect in a trade we sell to, really rung.
--                   Unlike not_in_niche (0117), which measures the list.
--   a pickup        no. The person we rang for never came to the phone.
--   a pass-through  no. The pitch did not happen.
--
-- It ends the prospect's time on the board the same way the three nos do:
-- Jake's call, 2026-08-25, "disqualify them".
--
-- No backfill. Every gatekeeper before today was pressed as something else and
-- nobody reviewed which, so re-filing history that was never checked would be
-- inventing a number rather than recovering one.
--
-- Idempotent: safe to re-run.

alter table public.cold_call_dials
  drop constraint if exists cold_call_dials_outcome_check;
alter table public.cold_call_dials
  add constraint cold_call_dials_outcome_check
  check (outcome in
    ('pending', 'no_answer', 'not_qualified', 'not_in_niche', 'opener_no',
     'pitch_no', 'gatekeeper', 'callback', 'booked'));

comment on column public.cold_call_dials.outcome is
  'What happened on the dial. The three no outcomes differ by how far the call '
  'got: not_qualified and opener_no never reached the pitch, pitch_no did, and '
  'only pitch_no counts toward pass-through. pending (0113) is a call the phone '
  'system reported that nobody has judged yet: it counts as a call made and as '
  'nothing else. not_in_niche (0117) is a business in a trade we do not sell to: '
  'it is the ONE outcome that is not counted as a dial anywhere, because ringing '
  'the wrong business measures the list rather than the day. gatekeeper (0123) '
  'is a real prospect whose front desk would not put us through: a dial, but '
  'neither a pickup nor a pass-through.';
