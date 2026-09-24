-- 0133: the owner story can carry a video of the owner.
--
-- Until now the owner story asked for one photo. A short clip of the owner
-- talking does the same job better, so the page takes a photo, a video, or
-- both (the photo then becomes the video's cover frame). Either one is enough
-- for the page to be buildable; contentIsComplete in conversionAssets.ts is
-- the rule.
--
-- The bytes live in the same public `followup-assets` bucket (0095), under
-- <tenant>/owner/. Videos are uploaded by the BROWSER straight to storage via
-- a signed upload URL (api/admin/followups/upload-url), not through the Worker,
-- because a phone video held in Worker memory is how a Worker dies.
--
-- Idempotent.

alter table public.followup_pages
  add column if not exists owner_video_url text not null default '';
