-- Onboarding becomes the whole client setup checklist again (Jake, 2026-09-23).
--
-- The checklist lives in the app, in five pillars: Setup, Operations, GHL, GHL
-- Follow Ups, Facebook Ads. The four checklist pillars are rows in setup_steps,
-- edited in Settings > Onboarding checklist.
--
-- The old rows (kickoff / call / ghl / ads, seeded from clientSetup.ts in 0072)
-- are retired: archived, and moved to a legacy_ section so the steps GET, which
-- seeds any section that has never had a row, writes Jake's new list in on the
-- next read. Nothing is deleted, so old ticks in onboarding_checklist still
-- resolve to a row.
--
-- Idempotent: the rename only touches the four old section names, and a second
-- run finds none left.

update public.setup_steps
   set archived   = true,
       section    = 'legacy_' || section,
       updated_at = now()
 where section in ('kickoff', 'call', 'ghl', 'ads');

-- An item may carry one text box, named by this label (e.g. "Fathom link" on
-- Onboarding Call Done). What was typed lands in onboarding_checklist.value.
alter table public.setup_steps
  add column if not exists field_label text;

-- What we sold and who works the leads, picked on the Setup step. Free text,
-- checked by the API against the options in src/lib/onboardingWizard.ts, so a
-- new bundle is a code change rather than a migration.
alter table public.tenants
  add column if not exists onboarding_bundle text,
  add column if not exists onboarding_dialer text;
