-- 0079: each client's ad creatives point at a Google Drive folder.
--
-- Paid Ads > Ad Library is retired. It tried to be two things at once: a mirror
-- of the client's Meta media library, and an internal creatives tracker whose
-- rows an operator typed by hand. Creatives are already made and stored in
-- Drive, so the app stops trying to BE the library and starts POINTING at one,
-- the same trade 0077 made for cold-call scripts.
--
-- Only the folder id is stored, never the pasted URL. Drive share links carry
-- query junk (?usp=sharing, ?dmr=, resourcekey) that goes stale and differs
-- between the copy-link button and the address bar, so the link is rebuilt from
-- the id on read. extractFolderId (functions/lib/driveDirect.ts) does the
-- parsing and already handles every shape those links come in.
--
-- Null is a normal state, not a missing value: a client with no folder set yet
-- shows the paste box to an operator and an honest "not set up yet" to the
-- client. It is deliberately NOT defaulted to an agency-wide folder, because a
-- client seeing another client's creatives is the one failure worth designing
-- against.
--
-- No foreign key to client_folders, and no row written there. That table belongs
-- to the assets/SOP system, whose reads all require the agency Drive OAuth
-- connection that has never been completed; writing a row there would surface a
-- broken folder in the client Assets page. This column needs no connection at
-- all, which is the entire point: a link works whether or not Drive is wired.
--
-- Run AFTER 0001..0078. Idempotent: safe to re-run.

alter table public.tenants
  add column if not exists creatives_drive_folder_id text;

comment on column public.tenants.creatives_drive_folder_id is
  'Google Drive folder id holding this client''s ad creatives. The app only ever '
  'links out to it (https://drive.google.com/drive/folders/<id>); it does not '
  'read the contents, so this works without the Drive OAuth connection. Null '
  'means no folder has been set for this client yet.';
