-- Software setup (Jake, 2026-09-23): a pop-up on the Onboarding page where the
-- bundle and who dials are picked and submitted. Submitting stamps the moment
-- the client's software went live, which is how Jake knows it has.
--
-- The Setup step that held the two choices is gone from the checklist; the
-- choices stay on tenants.onboarding_bundle / onboarding_dialer (0131).

alter table public.tenants
  add column if not exists software_live_at timestamptz;

-- Submitting also ticks "Software Account Made". It is found by this code, not
-- by its label, so renaming it in Settings keeps the wiring. Seeded rows from
-- 0131 carry no code yet; this gives the live one its handle.
update public.setup_steps
   set code = 'software-live', updated_at = now()
 where section = 'operations'
   and label = 'Software Account Made'
   and archived = false
   and code is null
   and not exists (select 1 from public.setup_steps where code = 'software-live');
