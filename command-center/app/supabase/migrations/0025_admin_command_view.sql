-- 0022: admin command view data layer. Backs the new Theory-of-Constraints
-- admin rebuild (roster + pillar command view prototype at
-- docs/mockups/admin-roster-full/admin.html). Adds:
--   1) pillar_constraints        - one row per business pillar (acquisition,
--      sales, delivery, operations) describing its current constraint.
--   2) pillar_constraint_steps   - the Identify/Exploit/Subordinate/Elevate/
--      Repeat attack plan for each constraint.
--   3) tenants.health_status / tenants.health_note - manual per-subaccount
--      health flag surfaced in the roster rail.
--
-- Seeds the 4 pillars with the exact placeholder copy from the approved
-- prototype (Jake will edit it in-app later; this just gets the admin view
-- off a blank slate). Delivery is seeded as the governing system constraint.
--
-- Run AFTER 0001..0021. Idempotent: safe to re-run. Not applied here; a
-- credentialed run of `pnpm db:migrate` happens separately.

-- =========================
-- pillar_constraints
-- =========================
create table if not exists public.pillar_constraints (
  id               uuid primary key default gen_random_uuid(),
  pillar           text not null unique,
  title            text not null,
  severity         text not null,
  metric           text,
  detail           text,
  impact           text,
  is_system        boolean not null default false,
  throughput_val   text,
  throughput_label text,
  updated_at       timestamptz not null default now(),
  constraint pillar_constraints_pillar_check
    check (pillar in ('acquisition','sales','delivery','operations')),
  constraint pillar_constraints_severity_check
    check (severity in ('high','med','low'))
);

-- =========================
-- pillar_constraint_steps
-- =========================
create table if not exists public.pillar_constraint_steps (
  id            uuid primary key default gen_random_uuid(),
  constraint_id uuid not null references public.pillar_constraints(id) on delete cascade,
  step          text not null,
  action        text not null,
  owner         text,
  status        text not null default 'todo',
  sort          int not null default 0,
  constraint pillar_constraint_steps_status_check
    check (status in ('todo','doing','done'))
);

create index if not exists pillar_constraint_steps_constraint_idx
  on public.pillar_constraint_steps (constraint_id);

-- =========================
-- tenants: manual health flag
-- =========================
alter table public.tenants add column if not exists health_status text not null default 'healthy';
alter table public.tenants add column if not exists health_note   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_health_status_check'
  ) then
    alter table public.tenants
      add constraint tenants_health_status_check
      check (health_status in ('healthy','warn','paused'));
  end if;
end $$;

-- =========================
-- seed: the 4 pillar constraints (verbatim prototype copy)
-- =========================
insert into public.pillar_constraints
  (pillar, title, severity, metric, detail, impact, is_system, throughput_val, throughput_label)
values
  ('acquisition',
   'Producing more than we can absorb',
   'low',
   '14 / mo · ~4 needed',
   'Acquisition is not the bottleneck. It already feeds more qualified leads than delivery can take on. Per Theory of Constraints, subordinate it: do not scale outbound until delivery capacity is elevated, or leads just pile up in front of the constraint and go stale.',
   'Has slack. Not governing throughput.',
   false,
   '14',
   'Qualified leads / mo'),
  ('sales',
   'Signed clients stall before they go live',
   'med',
   '~11 days signed → live',
   'Closing is healthy, but a signed client waits about eleven days to go live. The handoff into delivery is slow, so revenue is recognised late and early momentum is lost. This queue sits directly in front of the system constraint.',
   'Delays revenue; a symptom of the delivery bottleneck downstream.',
   false,
   '3',
   'Clients closed / mo'),
  ('delivery',
   'Delivery capacity is the system constraint',
   'high',
   '7 accounts · 1 media buyer',
   'One media buyer runs every live account, and the practical ceiling is around five. At seven, attention is spread thin: two accounts are drifting (CPL rising) and there is zero room to onboard the clients Sales has already signed. Until this is elevated, it caps the throughput of the entire business.',
   'Governs total revenue. New sales cannot convert; retention risk is rising.',
   true,
   '7 / 7',
   'Live accounts · at capacity'),
  ('operations',
   'Delivery can''t be delegated without SOPs',
   'med',
   'Ad-ops SOPs ~60% done',
   'The lever to elevate delivery is documented, repeatable ad-ops. Right now about 60% of that lives in one person''s head, so a second buyer can''t ramp quickly. Operations is the enabler for breaking the system constraint, so its priority is the delivery SOP set.',
   'Slows how fast delivery capacity can be elevated.',
   false,
   '62%',
   'Ad-ops SOP coverage')
on conflict (pillar) do nothing;

-- =========================
-- seed: attack-plan steps per constraint (sort preserves prototype order)
-- =========================
insert into public.pillar_constraint_steps (constraint_id, step, action, owner, status, sort)
select pc.id, v.step, v.action, v.owner, v.status, v.sort
from public.pillar_constraints pc
join (values
  -- acquisition
  ('acquisition', 0, 'Subordinate', 'Hold outbound at the rate delivery can absorb (~4 new clients / mo).', 'Jake', 'doing'),
  ('acquisition', 1, 'Exploit',     'Lift discovery show-rate 55% → 75% with a reminder sequence.',        'Ava',  'todo'),
  ('acquisition', 2, 'Repeat',      'Re-open the tap the moment delivery capacity is elevated.',            'Jake', 'todo'),
  -- sales
  ('sales', 0, 'Exploit',     'Standardise a 5-day onboarding sprint with a fixed checklist.', 'Nina', 'doing'),
  ('sales', 1, 'Subordinate', 'Match signing pace to delivery availability, not to quota.',     'Jake', 'todo'),
  ('sales', 2, 'Elevate',     'Templatise account setup so go-live needs less specialist time.', 'Leo',  'todo'),
  -- delivery (system constraint)
  ('delivery', 0, 'Identify',    'Delivery capacity confirmed as the binding constraint.',                                        'Jake', 'done'),
  ('delivery', 1, 'Exploit',     'Automate ad-ops with the optimizer engine + creative templates to cut hours per account.',       'Leo',  'doing'),
  ('delivery', 2, 'Subordinate', 'Hold Acquisition and Sales to the pace delivery can absorb.',                                    'Jake', 'doing'),
  ('delivery', 3, 'Elevate',     'Add a 2nd media buyer (hire or contractor) to raise the ceiling to ~12.',                        'Jake', 'todo'),
  ('delivery', 4, 'Repeat',      'Re-measure the constraint once the 2nd buyer has ramped.',                                       'Jake', 'todo'),
  -- operations
  ('operations', 0, 'Exploit',     'Finish the ad-ops SOP set: setup, optimise, refresh, report.', 'Leo',  'doing'),
  ('operations', 1, 'Elevate',     'Wire the optimizer engine so the SOP is partly automated.',    'Jake', 'todo'),
  ('operations', 2, 'Subordinate', 'Protect maker-time; batch internal meetings into one block.',  'Team', 'todo')
) as v(pillar, sort, step, action, owner, status)
  on v.pillar = pc.pillar
where not exists (
  select 1 from public.pillar_constraint_steps s where s.constraint_id = pc.id
);
