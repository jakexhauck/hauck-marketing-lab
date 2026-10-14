-- 0102: the lead status a client types, rather than one we derive.
-- Run AFTER 0001..0101. Idempotent: safe to re-run.
--
-- Why this exists. The client-facing status has always been DERIVED from the
-- lead's live GoHighLevel stage (functions/lib/leadStatus.ts), and for a client
-- whose leads we work ourselves that is right: the stage moves because our
-- setters move it, so the derived status is never stale.
--
-- Willis ring their own leads. Nobody moves their cards, so a derived status
-- derives from nothing that is being maintained, and every lead sits on New
-- while the owner works them all day. On their account the owner types it.
--
-- Per tenant, never global: every other client keeps the derived twelve.

-- ---------------------------------------------------------------------------
-- The switch.
--
-- A behaviour flag on the tenant, not a tenant_entitlements capability: those
-- decide which surfaces a business has and who on their staff may use them.
-- This decides how one column on a surface they already have is filled in.
alter table public.tenants
  add column if not exists manual_lead_status boolean not null default false;

comment on column public.tenants.manual_lead_status is
  'true: the owner types the lead status and it is read from lead_status. false (default): the status is derived from the live GHL stage.';

-- ---------------------------------------------------------------------------
-- lead_status: one row per lead the owner has touched.
--
-- Keyed on the GHL contact id, which is the key every other surface already
-- joins on, and NOT on an opportunity id: a contact holds cards in several
-- pipelines at once, and the owner is marking the person, not the card.
--
-- No history table. The question actually asked is "where is this lead now",
-- never "what was it last Tuesday", and a status log nobody reads is a table
-- that only ever grows.
--
-- The absence of a row is meaningful: it means nobody has touched this lead, so
-- it reads as New. That is what makes this safe to switch on with no backfill:
-- every existing contact reads New on day one without a single write.
create table if not exists public.lead_status (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  contact_id text not null,
  status     text not null,
  -- Who last set it. The account id, so a shared owner login and a named staff
  -- member are distinguishable later without another migration.
  set_by     text,
  set_at     timestamptz not null default now(),
  primary key (tenant_id, contact_id)
);

-- The eight labels, enforced here as well as in the API. A typo written by a
-- future caller would otherwise sit in the database reading as an unknown
-- status forever, and unknown statuses are exactly what this table exists to
-- stop. Kept in step with MANUAL_STATUS_ORDER in functions/lib/leadStatus.ts.
do $$
begin
  alter table public.lead_status
    add constraint lead_status_status_check
    check (status in (
      'new', 'contacted', 'no_answer', 'follow_up',
      'appointment_booked', 'quoted', 'won', 'lost'
    ));
exception
  when duplicate_object then null;
end $$;

-- Service-role only, matching customer_jobs (0029): RLS on with NO policies, so
-- a stray anon key can never read or write another tenant's pipeline.
alter table public.lead_status enable row level security;

-- The tracker's read: every typed status for one tenant, in one query.
create index if not exists lead_status_tenant_idx
  on public.lead_status (tenant_id);

-- ---------------------------------------------------------------------------
-- Job value typed straight onto the tracker row.
--
-- Revenue and ROAS already sum customer_jobs.value_cents by contact
-- (functions/lib/leadTrackerData.ts), and that table has been empty for every
-- client because the only way to fill it was a board close-out nobody uses. A
-- value typed on the tracker writes here, so the dashboard's revenue starts
-- being true the moment an owner marks their first won job.
--
-- entered_from marks the row as the tracker's own, so re-typing the value
-- UPDATES it instead of appending a second job, while a real close-out or a
-- hand-added backfill for the same contact is left alone.
alter table public.customer_jobs
  add column if not exists entered_from text;

comment on column public.customer_jobs.entered_from is
  'lead_tracker: typed on the Paid Ads lead tracker row, one per contact, updated in place. NULL: a board close-out or a hand-added job.';

create unique index if not exists customer_jobs_tracker_uidx
  on public.customer_jobs (tenant_id, ghl_contact_id)
  where entered_from = 'lead_tracker';
