-- 0117: "Not my niche" is an outcome, and it is not a dial.
--
-- The power dialer works whatever list it is pointed at, and a scraped list of
-- contractors contains businesses in trades we do not sell to. Until now the
-- only button for one of those said "Not qualified", which is a different thing:
-- not_qualified means somebody who could have bought and does not. The two were
-- being recorded as the same event, and both were counted as calls made.
--
-- Counting them made the day's dial number rise the WORSE the list was, which is
-- the opposite of what that number is for. So not_in_niche is its own outcome
-- and is left out of every dial total (the day counter on the dialing page, the
-- tracker's monthly Calls made, and each script's dials). The rule itself lives
-- in functions/lib/coldCallDials.ts as `counts`, in one place, so those three
-- cannot disagree about it.
--
-- Not a pickup and not a pitch either: spoke and pitched are both false. The
-- business was never a prospect, so nothing about the script was tested on it.
--
-- Idempotent: safe to re-run.

alter table public.cold_call_dials
  drop constraint if exists cold_call_dials_outcome_check;
alter table public.cold_call_dials
  add constraint cold_call_dials_outcome_check
  check (outcome in
    ('pending', 'no_answer', 'not_qualified', 'not_in_niche', 'opener_no',
     'pitch_no', 'callback', 'booked'));

-- The backfill, and the only day it touches.
--
-- On 2026-08-21 Jake worked a list through the power dialer and marked every
-- wrong-trade business "Not qualified", because that was the only button that
-- came close. All 56 of those rows arrived from GoHighLevel's dialer and none
-- lasted longer than seven seconds, so not one of them was a conversation about
-- qualifying. They are re-filed as what they were.
--
-- Fixed date on purpose: this is one day's correction, not a rule. 19 and 20
-- August are left exactly as they are, because their not_qualified rows were not
-- reviewed and re-writing history nobody checked is worse than leaving it.
--
-- The `where outcome = 'not_qualified'` is what makes it idempotent: a second
-- run finds nothing left to change.
update public.cold_call_dials
   set outcome = 'not_in_niche',
       spoke = false,
       pitched = false
 where day = '2026-08-21'
   and outcome = 'not_qualified';

comment on column public.cold_call_dials.outcome is
  'What happened on the dial. The three no outcomes differ by how far the call '
  'got: not_qualified and opener_no never reached the pitch, pitch_no did, and '
  'only pitch_no counts toward pass-through. pending (0113) is a call the phone '
  'system reported that nobody has judged yet: it counts as a call made and as '
  'nothing else. not_in_niche (0117) is a business in a trade we do not sell to: '
  'it is the ONE outcome that is not counted as a dial anywhere, because ringing '
  'the wrong business measures the list rather than the day.';
