-- 0186: Which Drive file an uploaded creative came from.
--
-- Client > Grok Bot > Add Creatives (Jake, 2026-10-27) copies images and
-- videos from the client's Drive "Finished Creatives" folder onto their
-- Creatives page. The Drive file id is kept on the row so the page knows what
-- is already in the app, and the unique index stops the same file landing
-- twice when a bot and Jake add it at once.
--
-- Null for a creative dropped straight into the app.
--
-- Idempotent.

alter table public.ad_creative_files
  add column if not exists drive_file_id text;

create unique index if not exists ad_creative_files_drive_file_uidx
  on public.ad_creative_files (tenant_id, drive_file_id)
  where drive_file_id is not null;
