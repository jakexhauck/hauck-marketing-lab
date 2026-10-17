-- 0169: Brief v2 (Jake, 2026-10-17). docs/build-plans/agents.md, "Brief v2".
--
-- The brief replaced the client setup pages, so it gains three sections no
-- agent writes: 'client' (the onboarding answers, seeded from the form, then
-- Jake's), and the 'onboarding-call' and 'launch-call' checklists. updated_by
-- is unchanged: still 'jake' or an agent id.
--
-- The checkboxes are not stored here. They stay the "sop:" rows in
-- onboarding_checklist, so every tick made on the old pages carries over.
--
-- Idempotent: the old check is dropped by its default name and re-added.

alter table public.client_briefs drop constraint if exists client_briefs_section_check;
alter table public.client_briefs add constraint client_briefs_section_check
  check (section in ('client','manager','onboarding-call','launch-call','research','ads','creative','landing','ghl','reporting'));
