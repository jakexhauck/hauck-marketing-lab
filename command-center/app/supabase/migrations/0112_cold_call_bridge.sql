-- 0112: how long the call actually lasted.
--
-- WHY. Until now a dial row recorded which button was pressed and nothing about
-- the call itself, because the call happened in a different tab on a system this
-- app only wrote tags to. The Call button on the call card changes that: the app
-- asks GoHighLevel to place the call, so it knows a call was placed, when, and
-- which one on the contact's timeline is ours.
--
-- GoHighLevel writes every call onto the contact's conversation as a TYPE_CALL
-- message carrying meta.call.duration, meta.call.status and altId, which is
-- Twilio's own CallSid. Four columns are enough to keep that.
--
-- What it buys: talk time per outcome, which is the number that separates a
-- script that gets hung up on at ten seconds from one that gets to the pitch and
-- loses. Pass-through already measures whether the pitch lands; nothing measured
-- how far a call got before it did not.
--
-- All four are nullable and stay that way. A null duration is not a gap in the
-- data, it is the normal reading for an unanswered call, and it is also what an
-- answered call looks like for the half minute GoHighLevel takes to finalise the
-- message. Recorded as unknown rather than guessed at, because every count on
-- the tracker is derived from these rows and a zero would average into them.
--
-- Nothing existing moves. The counts on the Cold Call tracker and the Scoreboard
-- are derived from spoke/pitched/outcome exactly as before (0052), so a row that
-- never gets a duration counts the same as it always did.

alter table public.cold_call_dials
  -- The GHL conversation message this call is, so the recording can always be
  -- found again: GET /conversations/messages/:id/locations/:locationId/recording.
  add column if not exists call_message_id text,
  -- Twilio's CallSid, the one id that survives outside GoHighLevel.
  add column if not exists call_sid text,
  -- completed / no-answer / busy / failed, as GoHighLevel reports it.
  add column if not exists call_status text,
  -- Seconds of connected talk time. Null when unanswered or not yet known.
  add column if not exists duration_seconds integer;

-- Guards a nonsense write from anything that later touches this table by hand.
-- A negative duration is not a shorter call, it is a bug.
alter table public.cold_call_dials
  drop constraint if exists cold_call_dials_duration_nonneg;
alter table public.cold_call_dials
  add constraint cold_call_dials_duration_nonneg
  check (duration_seconds is null or duration_seconds >= 0);

comment on column public.cold_call_dials.duration_seconds is
  'Connected talk time in seconds, read back from the GoHighLevel call message. Null means unanswered or not yet reported, never zero.';
