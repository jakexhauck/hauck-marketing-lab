-- 0142: one undo for the Setter Suite script.
--
-- "Write from template" (Setter Suite > Settings) replaces a client's dialing
-- script with the Client Setup template, company name filled. The script it
-- replaced is kept here so one press of Undo brings it back.
--
-- Run AFTER 0001..0141. Idempotent.

alter table public.setter_scripts add column if not exists previous_html text;
