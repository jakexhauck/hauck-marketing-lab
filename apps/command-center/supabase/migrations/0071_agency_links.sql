-- 0071_agency_links.sql — the handful of agency-wide links the app hands out
--
-- The welcome doc and the signing link that go to every new client. They belong
-- to the agency, not to a tenant, so they have nowhere to live in a schema where
-- every other table is keyed on tenant_id.
--
-- Deliberately a key/value table rather than a column per link: these are things
-- Jake pastes in and swaps out, and a new one should not need a migration. The
-- keys the app reads are named in src/lib/agencyLinks.ts; a row with any other
-- key is simply ignored, so this can never break a deploy.
--
-- Not secrets. A Google Doc share link is handed to clients by definition, which
-- is why these sit here rather than in Doppler with the credentials.

create table if not exists public.agency_links (
  key        text primary key,
  url        text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.agency_links enable row level security;
-- No policies: service-role only, same as onboarding / admin_tasks / intake_submissions.
-- Only /api/admin/* reads or writes this, and that path is admin-gated in
-- functions/api/_middleware.ts.
