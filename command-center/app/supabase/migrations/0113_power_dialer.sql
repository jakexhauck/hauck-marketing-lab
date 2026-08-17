-- 0113: calls that happened before anybody pressed a button.
--
-- WHY. Every dial row until now was created BY the outcome press: somebody
-- called, then said how it went, and that click wrote the row. That holds while
-- the caller drives the phone. It stops holding the moment GoHighLevel's power
-- dialer drives it instead, because the dialer moves faster than a person can
-- press, and the calls it places are real calls whether or not anybody got round
-- to describing them.
--
-- So the record is inverted for those: the CALL creates the row, and the press
-- only fills in what it became. A row that has been dialled and not yet judged
-- is `outcome = 'pending'`.
--
-- What a pending row counts as, in the tracker's derived numbers
-- (functions/lib/coldCallDials.ts): one call made, no pickup, no pass-through,
-- no booking. That is the honest reading. The call provably happened, because
-- GoHighLevel's own phone system reported it; whether anybody picked up is a
-- human judgement that has not been made yet, and inferring it from the call's
-- duration would be inventing the one number this table exists to not invent.
--
-- spoke/pitched stay false for a pending row and are set by the press, exactly
-- as they are for every other outcome (server side, from DIAL_OUTCOMES).
--
-- The unique index on call_message_id is the whole accuracy story. Every call
-- GoHighLevel places writes exactly one message onto the contact's conversation,
-- and its id is stable, so a poll that runs twice over the same call, or a
-- retried request, cannot produce a second row for it. One real call, one row.
--
-- Run AFTER 0112. Idempotent: safe to re-run.

-- 'pending' joins the six outcomes. It is deliberately NOT in DIAL_OUTCOMES, so
-- nothing in the app can send it: only the sync writes it.
alter table public.cold_call_dials
  drop constraint if exists cold_call_dials_outcome_check;
alter table public.cold_call_dials
  add constraint cold_call_dials_outcome_check
  check (outcome in
    ('pending', 'no_answer', 'not_qualified', 'opener_no', 'pitch_no',
     'callback', 'booked'));

-- One call, one row. Partial because the column is null for every dial recorded
-- before 0112 and for every call placed off a caller's own handset, and those
-- must not collide with each other.
create unique index if not exists cold_call_dials_call_message_idx
  on public.cold_call_dials (call_message_id)
  where call_message_id is not null;

-- The sync's own read: "every dial in the last twenty minutes", which is how it
-- knows which calls it has already seen without scanning the table.
create index if not exists cold_call_dials_dialed_at_idx
  on public.cold_call_dials (dialed_at desc);

comment on column public.cold_call_dials.outcome is
  'What happened on the dial. The three no outcomes differ by how far the call '
  'got: not_qualified and opener_no never reached the pitch, pitch_no did, and '
  'only pitch_no counts toward pass-through. pending (0113) is a call the phone '
  'system reported that nobody has judged yet: it counts as a call made and as '
  'nothing else.';

comment on column public.cold_call_dials.call_message_id is
  'The GoHighLevel conversation message this call is. Unique where set: it is '
  'what stops the power-dialer sync from recording one call twice.';
