-- 0153: Pickups from real calls, and the owner's estimate outcomes.
--
-- lead_touches        every call and inbound text on a client's GoHighLevel
--                     number, copied off the message export by the pickup
--                     sync (lib/leadPickupSync.ts). picked_up is the verdict
--                     for an outbound call: Claude reading the transcript when
--                     there is one, else 30+ seconds on the line. Null while a
--                     completed call is still waiting for its transcript.
--                     An inbound text or answered inbound call is contact made
--                     on its own, so it is stored with picked_up true.
--
-- lead_touch_sync     how far each client's export has been read, so a run
--                     only asks GoHighLevel for what is new.
--
-- estimate_outcomes   what the owner tapped on the outcome link texted after an
--                     estimate (api/estimate-outcome.ts). One row per estimate
--                     appointment; tapping again overwrites it. A Sold also
--                     writes a customer_jobs row (entered_from
--                     'estimate_outcome'), which is what the dashboard counts.
--                     customer_job_id points at it, so a second tap updates
--                     that row and a change of mind away from Sold deletes it.
--
-- Service-role only: RLS on, no policies.
-- Idempotent.

create table if not exists public.lead_touches (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  ghl_message_id  text not null,
  ghl_contact_id  text not null,
  kind            text not null,
  direction       text not null,
  status          text not null default '',
  duration_sec    integer,
  occurred_at     timestamptz not null,
  picked_up       boolean,
  method          text,
  checked_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint lead_touches_kind_chk check (kind in ('call', 'sms')),
  constraint lead_touches_direction_chk check (direction in ('inbound', 'outbound')),
  constraint lead_touches_method_chk
    check (method is null or method in ('ai', 'duration', 'status', 'inbound'))
);

alter table public.lead_touches enable row level security;

create unique index if not exists lead_touches_message_uidx
  on public.lead_touches (tenant_id, ghl_message_id);

create index if not exists lead_touches_contact_idx
  on public.lead_touches (tenant_id, ghl_contact_id);

-- The sync's work queue: completed outbound calls with no verdict yet.
create index if not exists lead_touches_pending_idx
  on public.lead_touches (tenant_id, occurred_at)
  where picked_up is null;

create table if not exists public.lead_touch_sync (
  tenant_id       uuid primary key references public.tenants (id) on delete cascade,
  synced_through  timestamptz not null,
  updated_at      timestamptz not null default now()
);

alter table public.lead_touch_sync enable row level security;

create table if not exists public.estimate_outcomes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  ghl_contact_id      text not null,
  ghl_appointment_id  text not null,
  outcome             text not null,
  amount_cents        integer,
  reason              text,
  job_appointment_id  text,
  rebooked_at         timestamptz,
  customer_job_id     uuid references public.customer_jobs (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint estimate_outcomes_outcome_chk
    check (outcome in ('sold', 'not_sold', 'rescheduled', 'no_show'))
);

alter table public.estimate_outcomes enable row level security;

create unique index if not exists estimate_outcomes_appt_uidx
  on public.estimate_outcomes (tenant_id, ghl_appointment_id);

create index if not exists estimate_outcomes_contact_idx
  on public.estimate_outcomes (tenant_id, ghl_contact_id);

-- tenants.estimate_tracking: the Ads Dashboard counts this client the new way
-- (Pickup % from real calls, Estimates from the estimate calendar, Jobs from the
-- outcome link) and the pickup sync reads their calls.
--
-- An explicit switch, not "has a Home Estimate calendar": Willis Windows has
-- one too, and Willis stays on the stage-based numbers. Every client that
-- exists today is off; every client created from here on is on.
alter table public.tenants
  add column if not exists estimate_tracking boolean not null default false;

alter table public.tenants
  alter column estimate_tracking set default true;

-- The Test v2 template, so the snapshot can be checked end to end.
update public.tenants
  set estimate_tracking = true
  where ghl_location_id = 'yVfX127fswQ03fydxBQg';
