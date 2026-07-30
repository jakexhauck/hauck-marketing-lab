-- 0072_setup_steps.sql — the client setup steps, editable in the app
--
-- The steps used to live in src/lib/clientSetup.ts, which meant adding one was a
-- deploy. They are Jake's process and it changes when the process changes, so
-- they move into a table and the Management page edits them.
--
-- The code list does not disappear: it becomes the SEED. The first read of an
-- empty table writes it in, so a fresh database arrives with the real process
-- rather than an empty page nobody would fill in by hand.
--
-- Ticks stay in onboarding_checklist (0018), whose task_key is free text: it now
-- holds this table's id. Nothing about that table changes.

create table if not exists public.setup_steps (
  id          uuid primary key default gen_random_uuid(),
  -- 'ghl' | 'ads'. The two sections of the Client setup page.
  section     text not null,
  -- Optional subheading inside a section, e.g. "Day 2, research and setup".
  -- Free text on purpose: a new phase should be an afternoon, not a migration.
  group_label text,
  label       text not null,
  note        text,
  -- Order within a section. Gaps are fine and expected after a reorder.
  position    integer not null default 0,
  -- Must be done before Go Live. Everything else is judgement.
  required    boolean not null default true,
  -- A stable handle for the three steps the live GoHighLevel checks tick by
  -- themselves ('provision-values', 'token-connected', 'calendars-present').
  -- Null for every step a human ticks. Renaming such a step keeps its wiring,
  -- which is the whole reason the auto steps are not matched on their label.
  code        text unique,
  -- Retired rather than deleted: a client who ticked it keeps a row that still
  -- resolves, and the step simply stops appearing.
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.setup_steps enable row level security;
-- No policies: service-role only, same as onboarding / intake_submissions.
-- Only /api/admin/* reads or writes it, and that path is admin-gated in
-- functions/api/_middleware.ts.

create index if not exists setup_steps_section_idx
  on public.setup_steps (section, position)
  where archived = false;

comment on table public.setup_steps is
  'The client setup checklist, editable from Onboarding > Management. Seeded from src/lib/clientSetup.ts on first read.';
