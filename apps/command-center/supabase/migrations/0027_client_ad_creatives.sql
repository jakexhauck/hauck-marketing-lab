-- 0027: internal ad creatives tracker for the Fulfillment cockpit's Paid Ads
-- > Ad Library sub-tab.
--
-- This is an agency-side draft tracker only: an operator logs a creative idea
-- (headline, primary text, an optional media reference) and moves it through
-- draft -> approved -> live by hand. It does NOT push anything to Meta. The
-- Ad Library panel's real Meta media gallery (functions/lib/adsMedia.ts) is a
-- separate, already-shipped read from the client's live ad account; this
-- table only stores the agency's own drafts, scoped per tenant like every
-- other per-client table.
--
-- Push-to-Meta (creating an actual Meta adimage/advideo/ad from a row here)
-- is intentionally out of scope for this migration and split to Phase 2b: it
-- cannot be verified against a live Meta token in this build environment, and
-- an unverified prod write to a client's ad account is unsafe to ship blind.
--
-- Run AFTER 0001-0026. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies),
-- matching website_change_requests / admin_tasks.

create table if not exists public.client_ad_creatives (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  -- Optional pointer at an existing Meta media item (image hash / video id) or
  -- any free-text reference the operator uses to identify the asset; not a
  -- foreign key, since the asset itself lives in Meta, not this table.
  media_ref     text,
  headline      text,
  primary_text  text,
  -- draft | approved | live. All three are agency-side status only until
  -- Phase 2b's push actually creates something in Meta.
  status        text not null default 'draft' check (status in ('draft', 'approved', 'live')),
  -- Who logged it: "admin:<id>", best-effort.
  created_by    text,
  created_at    timestamptz not null default now()
);

alter table public.client_ad_creatives enable row level security;

create index if not exists client_ad_creatives_tenant_id_idx
  on public.client_ad_creatives (tenant_id);
