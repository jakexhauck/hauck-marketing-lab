-- 0054_onboarding_intake.sql — the client's own intake answers
--
-- onboarding.fields holds the values we push into the client's GHL sub-account,
-- keyed by the provisioning map in src/lib/onboarding.ts. The intake
-- questionnaire (wizard steps 4-6: contact + legal, targeting, story) is a
-- different thing entirely: the client's own answers, never written to GHL.
-- Same row, separate namespace, so buildProvisionPlan never has to step around
-- keys that were never meant for it.

alter table public.onboarding
  add column if not exists intake jsonb not null default '{}'::jsonb;
