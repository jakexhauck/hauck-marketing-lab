-- 0020: pillar tasks. Lets each business-pillar workspace (the admin pillar
-- pages, /admin/pillar/<id>/tasks) carry its own editable task list instead of
-- the read-only roadmap that used to live only in pillars.ts.
--
-- Reuses admin_tasks (0012). Two new nullable columns:
--   pillar_id  null  = a standalone agency/client task (today's /admin/tasks).
--              <id>  = a pillar id from pillars.ts (operations, outreach, ...).
--   note       optional context line shown under the title (preserves the
--              roadmap notes).
-- A task is never both: pillar tasks have tenant_id null and pillar_id set.
--
-- Then a one-time seed of the current pillars.ts roadmap as rows. Every seeded
-- task is unchecked (the old todo/doing states both collapse to not-done). The
-- seed is guarded so re-running the migration does not duplicate it.
--
-- Run AFTER 0001..0019. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

alter table public.admin_tasks
  add column if not exists pillar_id text,
  add column if not exists note      text;

create index if not exists admin_tasks_pillar_idx
  on public.admin_tasks (pillar_id);

-- Seed the roadmap. created_at is offset by the row ordinal so the listing's
-- ascending sort preserves the original pillars.ts order; tasks added later get
-- now() and fall after the seed.
insert into public.admin_tasks (pillar_id, title, note, completed, created_at)
select v.pillar_id, v.title, v.note, false,
       now() + (v.ord * interval '1 second')
from (values
  (1,  'operations',  'Document the core agency SOPs in the hub',                                          'SOP Hub seeded; many processes still need written steps.'),
  (2,  'operations',  'Finish the software stack inventory',                                               null),
  (3,  'operations',  'Stand up company-wide reporting',                                                   'Not set up yet.'),
  (4,  'outreach',    'Pick the first channel to systematize',                                             'Cold email is the cheapest to automate.'),
  (5,  'outreach',    'Define the shared lane skeleton (source, capture, sequence, handoff, scoreboard)',  null),
  (6,  'sales',       'Write the discovery call script',                                                   null),
  (7,  'sales',       'Build the proposal template',                                                       null),
  (8,  'onboarding',  'Templatize the GHL snapshot provisioning',                                          null),
  (9,  'onboarding',  'Tighten the access + assets collection step',                                       null),
  (10, 'service',     'Write the paid-ads weekly management SOP',                                          null),
  (11, 'service',     'Turn the software setup into a one-click clone',                                     null),
  (12, 'retention',   'Automate the monthly client report from the software',                              null),
  (13, 'retention',   'Define the churn-risk early-warning signals',                                       null)
) as v(ord, pillar_id, title, note)
where not exists (
  select 1 from public.admin_tasks where pillar_id is not null
);
