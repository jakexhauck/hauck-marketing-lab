-- 0167: a conversion asset can be a page that lives somewhere else.
--
-- The Landing Page Agent (docs/build-plans/agents.md, Phase 2) builds a page
-- as code and deploys it to Cloudflare Pages itself. When Jake approves one,
-- api/agent-runner/file-asset files it here as a row with external_url set:
-- the page is not served from page_source, so the builder steps do not apply,
-- and the Conversion Assets screen shows it as a link card instead.
--
-- title names the card; the three fixed slots never needed one because their
-- kind is their name. An external row has asset_kind '' and slug '', so it
-- stays clear of both partial unique indexes and a client can hold any number.
--
-- Idempotent.

alter table public.followup_pages
  add column if not exists external_url text not null default '',
  add column if not exists title        text not null default '';

-- The filing endpoint looks a page up by its URL so a re-run files it once.
create index if not exists followup_pages_tenant_external_idx
  on public.followup_pages (tenant_id, external_url)
  where external_url <> '';
