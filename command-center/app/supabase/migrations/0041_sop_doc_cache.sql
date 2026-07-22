-- Rendered SOP Docs, cached.
--
-- SOP content lives in Google Drive, not here. Exporting a Doc to HTML and
-- sanitizing it costs a few hundred ms per open, which is too slow to pay on
-- every page view. This table is a cache, never a source of truth: it is keyed
-- by Drive's own modified_time, so editing the Doc invalidates the row on the
-- next read. Dropping this table loses nothing but speed.
--
-- Service-role only, matching 0017: RLS on, no policies.

create table if not exists public.sop_doc_cache (
  file_id       text primary key,
  modified_time text not null,
  title         text,
  html          text not null,
  cached_at     timestamptz not null default now()
);

alter table public.sop_doc_cache enable row level security;

comment on table public.sop_doc_cache is
  'Cache of Google Doc SOPs rendered to clean HTML. Keyed by Drive modifiedTime; safe to truncate.';
