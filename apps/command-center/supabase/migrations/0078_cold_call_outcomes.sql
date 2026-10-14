-- 0078: the reason a prospect said no becomes the outcome itself.
--
-- Recording a no used to take two decisions. First an outcome (brush_off or
-- not_interested), then a reason from a list of five, and the reason decided the
-- outcome server-side. Two clicks and two vocabularies for one fact, at the exact
-- moment somebody has just been told no and wants to get to the next number.
--
-- The three that matter are now outcomes in their own right:
--
--   not_qualified  spoke to them, they do not qualify. Never pitched.
--   opener_no      said no during the opener. Never heard the pitch.
--   pitch_no       heard the whole pitch and said no.
--
-- The pitched flag is the point of the split and the only one that moves a
-- number: pass-through counts pitches, so it is the measure of whether the
-- script survives contact. Grouping "would not engage" with "heard it all and
-- declined" inflated that, which is the same reason brush_off existed at all.
--
-- Old rows migrate by REASON where they have one, because the reason is the more
-- specific fact and maps exactly:
--   no_engage, not_decision_maker -> opener_no   (answered, never got to pitch)
--   bad_fit                       -> not_qualified
--   pitched_no, has_agency        -> pitch_no    (heard it, said no)
-- A row with no reason falls back on its outcome, which carries the same
-- pitched/not-pitched distinction and is therefore never a guess.
--
-- `reason` is kept, not dropped. It is now legacy: nothing writes it and nothing
-- reads it, but it is the record of how a call was described at the time, and
-- deleting that to tidy a column is not a trade this migration is entitled to
-- make. The Objections tracker column counts OUTCOMES from here on.
--
-- Run AFTER 0001..0077. Idempotent: safe to re-run.

alter table public.cold_call_dials
  drop constraint if exists cold_call_dials_outcome_check;

-- By reason first: it is the more specific fact.
update public.cold_call_dials
   set outcome = 'opener_no'
 where outcome in ('brush_off', 'not_interested')
   and reason in ('no_engage', 'not_decision_maker');

update public.cold_call_dials
   set outcome = 'not_qualified'
 where outcome in ('brush_off', 'not_interested')
   and reason = 'bad_fit';

update public.cold_call_dials
   set outcome = 'pitch_no'
 where outcome in ('brush_off', 'not_interested')
   and reason in ('pitched_no', 'has_agency');

-- Then by the old outcome, for rows recorded before reasons existed (0056).
-- brush_off was answered-but-never-pitched; not_interested was pitched.
update public.cold_call_dials
   set outcome = 'opener_no'
 where outcome = 'brush_off';

update public.cold_call_dials
   set outcome = 'pitch_no'
 where outcome = 'not_interested';

-- spoke/pitched are stored, not derived on read (rollUpDialsByDay trusts the
-- row), so they are corrected here too or a migrated dial keeps counting the way
-- its old outcome did.
update public.cold_call_dials
   set spoke = true, pitched = false
 where outcome in ('not_qualified', 'opener_no');

update public.cold_call_dials
   set spoke = true, pitched = true
 where outcome = 'pitch_no';

alter table public.cold_call_dials
  add constraint cold_call_dials_outcome_check
  check (outcome in
    ('no_answer', 'not_qualified', 'opener_no', 'pitch_no', 'callback', 'booked'));

comment on column public.cold_call_dials.outcome is
  'What happened on the dial. The three no outcomes differ by how far the call '
  'got: not_qualified and opener_no never reached the pitch, pitch_no did, and '
  'only pitch_no counts toward pass-through.';

comment on column public.cold_call_dials.reason is
  'LEGACY (0078). The separate why-they-said-no list, which the outcome now '
  'carries. Nothing writes or reads this; kept as the record of how these calls '
  'were described when they were made.';
