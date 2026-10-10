-- 0150: the Leads board (Jake, 2026-10-08).
--
-- The board sits on the client's GHL "Sales Pipeline". GHL owns the stage; the
-- app owns everything the owner tells it about a lead:
--
--   lead_bookings   estimate and job appointments. No GHL calendar: clients do
--                   not self-book, so the app holds the date. source says who
--                   made it, so self-booked GHL calendar appointments can land
--                   in the same table later without a second model.
--   lead_followups  when to follow up, and a note. No GHL task.
--   lead_outcomes   per-opportunity facts: lost reason, call attempts.
--
-- Reschedule updates starts_at on the same booking row. One scheduled booking
-- per opportunity per kind, and one open follow-up per opportunity.
--
-- Idempotent: safe to re-run. Service-role only (RLS on, no policies).

create table if not exists public.lead_bookings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  ghl_opportunity_id  text not null,
  ghl_contact_id      text,
  kind                text not null check (kind in ('estimate', 'job')),
  starts_at           timestamptz not null,
  status              text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  source              text not null default 'app' check (source in ('app', 'ghl_calendar')),
  ghl_appointment_id  text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists lead_bookings_one_scheduled
  on public.lead_bookings (tenant_id, ghl_opportunity_id, kind)
  where status = 'scheduled';
create index if not exists lead_bookings_tenant_starts
  on public.lead_bookings (tenant_id, starts_at);

alter table public.lead_bookings enable row level security;

create table if not exists public.lead_followups (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  ghl_opportunity_id  text not null,
  ghl_contact_id      text,
  due_at              timestamptz not null,
  note                text not null default '',
  done_at             timestamptz,
  created_by          text,
  created_at          timestamptz not null default now()
);

create unique index if not exists lead_followups_one_open
  on public.lead_followups (tenant_id, ghl_opportunity_id)
  where done_at is null;

alter table public.lead_followups enable row level security;

create table if not exists public.lead_outcomes (
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  ghl_opportunity_id  text not null,
  lost_reason         text check (lost_reason in ('price', 'timing', 'competitor', 'ghosted', 'diy', 'other')),
  attempts            integer not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (tenant_id, ghl_opportunity_id)
);

alter table public.lead_outcomes enable row level security;
