-- 0097: name the pipeline that decides what a client sees in their Inbox.
--
-- The client Inbox is now gated (Jake, 2026-08-10): a client sees the chats for
-- estimates we book and leads we hand off, not the setter's raw opt-ins,
-- no-answer chases and binned leads. "Handed off" and "estimate booked" are the
-- first two stages of the live Willis "3) Sales" pipeline, so the gate is: the
-- contact holds an opportunity in the hand-off pipeline.
--
-- The server finds that pipeline BY NAME (exact 'sales', then any name
-- containing 'sales', then the known Willis id), which needs no configuration
-- for a client who calls theirs Sales. This column is the override for one who
-- does not: paste their pipeline id and it wins.
--
-- NULL for everyone by default, so nothing changes for an existing client.
-- A client whose pipeline resolves to nothing keeps seeing every conversation,
-- exactly as before -- a config gap must never blank an Inbox.
--
-- Run AFTER 0096. Idempotent.

alter table public.tenants
  add column if not exists client_inbox_pipeline_id text;

comment on column public.tenants.client_inbox_pipeline_id is
  'GHL pipeline id whose opportunities make a conversation visible in this '
  'client''s Inbox. NULL means resolve by name (''sales''), which is right for '
  'most clients; set it only when a client names their hand-off pipeline '
  'something else. Unresolvable => the Inbox is ungated and shows everything.';
