-- 0152: Ad creatives uploaded into the app.
--
-- Replaces the Drive folder on Paid Ads > Creatives. Drive could list a
-- folder through Composio but never move its bytes, so a client could not
-- open a creative without leaving the app. The operator now uploads images and
-- videos here; the browser PUTs straight to the private bucket on a signed URL
-- and the client views them through short-lived signed URLs.
--
-- tenants.creatives_drive_folder_id is left in place, unread. Dropping it buys
-- nothing and cannot be undone.
--
-- Service role only: no RLS policies, every read goes through a Worker route
-- that scopes by tenant.
--
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-creatives',
  'ad-creatives',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

create table if not exists public.ad_creative_files (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  path        text not null unique,
  name        text not null,
  kind        text not null check (kind in ('image', 'video')),
  mime_type   text not null,
  size_bytes  bigint not null check (size_bytes > 0),
  width       integer,
  height      integer,
  created_at  timestamptz not null default now()
);

create index if not exists ad_creative_files_tenant_idx
  on public.ad_creative_files (tenant_id, created_at desc);

alter table public.ad_creative_files enable row level security;
