-- 0077: scripts, SOPs and objection handling point at the SOP Hub.
--
-- Until now a cold-call document was written twice: once in Google Docs, where
-- Jake actually writes, and once again into a rich-text box in this app. Two
-- copies of the same words is one copy too many, and the app's was always the
-- stale one.
--
-- So a row stops BEING the document and starts POINTING at one. `drive_file_id`
-- is a file in the agency's SOP folder, rendered through the endpoint the SOP Hub
-- already uses (/api/admin/sops/doc/:fileId). Writing happens in Docs; this table
-- only records which document plays which part.
--
-- `html` IS NOT DROPPED, and that is deliberate. A row with no drive_file_id
-- still renders its stored markup, so the four scripts and the objections
-- document that exist today keep working untouched and can be pointed at Drive
-- one at a time. A hard cutover would have blanked the panel a caller reads
-- mid-call, in exchange for a column.
--
-- The call shelf goes. `kind = 'asset'` was "anything else read mid-call", and in
-- practice it held exactly one document: objection handling. That is not a shelf,
-- it is one thing with a vague name, so it becomes its own kind and is rendered
-- inside the script panel rather than behind a second button.
--
-- Run AFTER 0001..0076. Idempotent: safe to re-run.

alter table public.cold_call_assets
  add column if not exists drive_file_id text;

alter table public.cold_call_assets
  add column if not exists drive_title text;

comment on column public.cold_call_assets.drive_file_id is
  'Google Drive file id in the SOP folder, rendered via /api/admin/sops/doc/:fileId. '
  'Null means this row still uses its own stored html.';

comment on column public.cold_call_assets.drive_title is
  'The Drive document title as it was when picked, so the picker can name the '
  'choice without a Drive round trip. Display only; drive_file_id is identity.';

-- Dropped BEFORE the rows move, or the update below writes a kind the current
-- constraint has never heard of and the whole migration aborts.
alter table public.cold_call_assets
  drop constraint if exists cold_call_assets_kind_check;

-- Objection handling stops being one entry on a shelf and becomes its own kind.
-- Matched on the name because that is exactly how the app found it before
-- (ColdCallSection searched /objection/i), so this moves the same row the
-- Objections button has always opened.
update public.cold_call_assets
   set kind = 'objections', category = ''
 where kind = 'asset'
   and name ~* 'objection';

-- Anything else left on the shelf keeps its content but stops being rendered:
-- archived, not deleted, because deleting somebody's writing to retire a page is
-- not a trade this migration is entitled to make.
update public.cold_call_assets
   set archived_at = now()
 where kind = 'asset'
   and archived_at is null;

-- 'asset' stays legal so the archived rows above remain readable. Nothing
-- creates one any more: the API refuses the kind.
alter table public.cold_call_assets
  add constraint cold_call_assets_kind_check
  check (kind in ('script', 'sop', 'objections', 'asset'));

-- There is one objections document, not a list. A partial unique index rather
-- than a constraint, so archiving one and pointing at another still works.
create unique index if not exists cold_call_assets_one_objections_idx
  on public.cold_call_assets ((kind))
  where kind = 'objections' and archived_at is null;
