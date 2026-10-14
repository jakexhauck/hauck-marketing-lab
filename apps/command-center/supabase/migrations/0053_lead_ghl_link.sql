-- 0053: the link between a lead in this app and its record in the agency's own
-- GoHighLevel account.
--
-- The app pushes; GHL never pushes back. The contact id exists so the push is
-- idempotent: knowing it is what turns the second call on the same prospect
-- into an update rather than a duplicate contact.
--
-- There is no opportunity id here on purpose. The app writes ONE "cc " tag per
-- call and nothing else; every pipeline move and every automation is Jake's,
-- driven from those tags inside GHL. Two systems moving the same card is how a
-- pipeline ends up lying about itself.
--
-- ghl_error is deliberately stored rather than logged. A push that failed is a
-- fact the person on the phone is entitled to see next to the prospect, not
-- something to find later in a log nobody reads. It is cleared on the next
-- successful push.
--
-- Nothing here is a status. The lead's status lives in `status` as it always
-- has, and GHL is never asked for its opinion of it, so the two cannot drift.
--
-- Run AFTER 0001..0052. Idempotent: safe to re-run.

alter table public.leads
  add column if not exists ghl_contact_id text,
  add column if not exists ghl_synced_at timestamptz,
  add column if not exists ghl_error text;

-- Finding the lead behind a contact, for anything that later reads GHL's side
-- (appointments, conversations).
create index if not exists leads_ghl_contact_idx
  on public.leads (ghl_contact_id)
  where ghl_contact_id is not null;

comment on column public.leads.ghl_contact_id is
  'The contact in Hauck Marketing''s own GHL sub-account. Set on the first successful push; makes every later push an update rather than a duplicate.';

comment on column public.leads.ghl_error is
  'Why the last push failed, in words a caller can read. Null when the last push worked.';
