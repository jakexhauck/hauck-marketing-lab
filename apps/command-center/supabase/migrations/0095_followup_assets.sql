-- 0095: uploads and slotted assets for follow-up pages.
--
-- 0093 modelled design and assets the way a form does: paste a logo URL, add
-- rows of {kind, url, label}. In practice nobody has a URL for a photo that is
-- sitting on their desktop, and a freeform row list never says what the page
-- actually NEEDS. A before/after slider is not "two rows of kind
-- before-after", it is a BEFORE photo and an AFTER photo, in that order, and
-- asking for them by name is the difference between a slider that works and a
-- pair that crops the wrong way round.
--
-- So two changes:
--
-- 1. FILES, not links. A public storage bucket, uploaded through
--    /api/admin/followups/upload. Public rather than signed because the built
--    page is served on the CLIENT'S domain by GoHighLevel and loaded by
--    strangers off a text message: a signed URL that expires is a page whose
--    photos vanish, and nothing here is private (it is marketing photography
--    the client wants seen).
--
-- 2. SLOTS, not rows. media_treatment says what the page draws, and the slot
--    list follows from it: 'before-after' asks for before and after by name,
--    'gallery' asks for a count, 'video' asks for a URL and an optional
--    poster. The wizard can then say "this page needs 2 photos" instead of
--    leaving an operator to guess.
--
-- design_colors_source exists because "pull the look from their website" and
-- "use these exact colours" are different instructions, and a page built from
-- the wrong one looks like a different company. It only applies when
-- design_source is 'website'; a design kit carries its own colours and is not
-- asked (the kit IS the answer), while 'default' still asks, because a default
-- is a starting point rather than a decision already made.
--
-- Run AFTER 0094. Idempotent.

alter table public.followup_pages
  -- 'website' | 'custom'. Only read when design_source = 'website'.
  add column if not exists design_colors_source text not null default 'custom',
  -- An uploaded brand/design kit (pdf, zip, image). Empty unless
  -- design_source = 'kit'.
  add column if not exists design_kit_url text not null default '',
  -- 'photo' | 'before-after' | 'gallery' | 'video'. What the page draws, and
  -- therefore which asset slots get asked for.
  add column if not exists media_treatment text not null default 'photo';

comment on column public.followup_pages.assets is
  'Slotted assets: [{slot, kind, url, label}]. slot is named (before, after, '
  'hero, gallery, video, poster, extra) so a before/after pair cannot be '
  'stored in the wrong order.';

-- Public: the built page is served on the client''s own domain and loaded by
-- anyone who taps the text. A signed URL would expire and the photos would
-- silently disappear from a live page.
insert into storage.buckets (id, name, public)
values ('followup-assets', 'followup-assets', true)
on conflict (id) do nothing;

-- No storage policies. Writes go through the service role in
-- /api/admin/followups/upload, which is admin-gated in _middleware.ts; reads
-- are public by virtue of the bucket. An anonymous client can never write here
-- because it never holds the service key.
