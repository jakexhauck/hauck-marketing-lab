-- 0093: SMS follow-up asset pages. One row per page, many per client.
--
-- The page an SMS sends a lead to when they came in from a Facebook ad and did
-- NOT book. Willis has two live today (/phone-estimate and /recent-cleaning),
-- both hand-built inside GHL's page builder, which means they can only be
-- edited by reopening the builder and nothing about them is in git.
--
-- This table is the intake record: everything the followup-page skill needs to
-- build one, captured through the wizard at
-- /admin/fulfillment/ghl?sub=follow-ups instead of through a chat transcript
-- that is gone the next morning.
--
-- WHY A ROW PER PAGE, not one workspace per client like ad_workspace (0091):
-- ad copy has a current version and no history worth keeping. A follow-up page
-- is a PUBLISHED ARTEFACT at a real URL. Two of them exist at once for new-lead
-- follow ups, they get referenced by live GHL workflow steps, and overwriting
-- one because a second was written would take a page offline. They are not
-- versions of each other.
--
-- page_source is the built file body and is EMPTY until it is built. Today the
-- wizard collects and a human builds; the column exists so that when the build
-- is generated instead, the page has somewhere to live and functions/sites can
-- serve it without another migration. An empty page_source serves 404, never a
-- blank page.
--
-- THE PAIRING RULE, encoded in `step`: new-lead follow ups get exactly two
-- asset sends, so step is 1 or 2. estimate-assets is not capped that way and
-- uses step for ordering only.
--
-- Run AFTER 0092. Idempotent.
-- Service-role only, admin-gated in _middleware.ts, EXCEPT the built page body
-- which functions/sites reads with the service client to serve publicly.

create table if not exists public.followup_pages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,

  -- 'new-leads' | 'estimate-assets'. Free text, checked in the shared lib
  -- rather than by a constraint, so adding a third kind is a code change and
  -- not a migration.
  followup_type text not null default 'new-leads',
  step          integer not null default 1,

  -- The slug is the page's identity on the client's GHL domain. Unique per
  -- client: two pages at one URL is not a state that can be true.
  slug          text not null default '',

  -- The message that sells the click. Approved before anything else is asked,
  -- because it is what decides the page type.
  sms_body      text not null default '',
  page_type     text not null default '',

  -- 'website' | 'kit' | 'default'. design_ref carries the site URL or a note
  -- about the kit. colors is the answer to "which colours", asked every time,
  -- including on the default.
  design_source text not null default 'default',
  design_ref    text not null default '',
  colors        jsonb not null default '[]'::jsonb,

  logo_url      text not null default '',
  -- [{ kind, url, label }] where kind is photo | video | before-after | gallery
  assets        jsonb not null default '[]'::jsonb,

  -- What the appointment IS for this client: a phone estimate for Willis, an
  -- in-person visit for the next one. Every CTA line on the page depends on it.
  appointment_type text not null default '',
  -- The GHL calendar embed code. It sits ON the page: the lead reads and books
  -- in one place, so there is no handoff to prefill and no PII in any URL.
  calendar_embed   text not null default '',

  -- 'draft' | 'built' | 'live'
  status        text not null default 'draft',
  -- The built file body. Empty until built. See the note at the top.
  page_source   text not null default '',
  -- Whether a build exists, without shipping the build to say so. The wizard
  -- lists pages and needs the flag; the body can be 400k and has no business
  -- crossing the wire into an admin list. Generated, so it cannot disagree.
  has_source    boolean generated always as (page_source <> '') stored,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One page per slug per client. Partial, so the many drafts that have not been
-- given a slug yet do not collide with each other on the empty string.
create unique index if not exists followup_pages_tenant_slug_idx
  on public.followup_pages (tenant_id, slug)
  where slug <> '';

-- The wizard's only list read: this client's pages, newest work first.
create index if not exists followup_pages_tenant_idx
  on public.followup_pages (tenant_id, followup_type, step);

alter table public.followup_pages enable row level security;
-- No policies: service-role only, same as ad_workspace and ad_lead_forms. A
-- client must never reach this table. It holds unpublished copy.

comment on table public.followup_pages is
  'SMS follow-up asset pages: the intake for the followup-page skill plus the '
  'built page body. One row per published page, many per client. New-lead '
  'follow ups use step 1 and 2 and no more.';
