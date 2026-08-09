-- 0094: the one lever that unsticks a client the social gate has locked out.
--
-- The Social connect gate is deliberately HARD (Jake, 2026-08-09): a client sees
-- a blocking modal on sign-in and cannot reach anything else until their
-- Facebook page AND Instagram account are connected to their sub-account.
--
-- That is the intended behaviour, and this column does not soften it. It exists
-- because a hard gate has failure modes the client cannot fix from inside it:
--
--   the business has no Facebook page yet
--   the person signing in is not an admin of the page
--   the Instagram account is personal, not a Business account linked to the page
--   Meta or GHL is simply down
--
-- In every one of those the client is locked out of software they are paying
-- for, and the only fix without this column is a deploy. With it, an admin flips
-- one switch on the client record and they are through.
--
-- Default FALSE, so the gate applies to everyone unless somebody deliberately
-- decides otherwise. Nothing sets this except an admin editing a client.
--
-- Run AFTER 0093. Idempotent.

alter table public.tenants
  add column if not exists social_gate_waived boolean not null default false;

comment on column public.tenants.social_gate_waived is
  'Admin override for the blocking social-connect gate. FALSE for everyone by '
  'default; set TRUE only to unstick a client who cannot pass the gate for a '
  'reason outside their control (no page, not a page admin, personal Instagram, '
  'Meta outage). Does not weaken the gate for anyone else.';
