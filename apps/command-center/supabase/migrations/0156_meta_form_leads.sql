-- 0156: leads read straight off a client's Meta lead forms (Jake, 2026-10-10).
-- AAG's GHL took no opportunities in, so their Lead Tracker was empty while
-- Meta held the leads. The tracker now adds these for a tenant with
-- meta_form_leads on (lib/metaFormLeads.ts). Server only: no policies.
create table if not exists public.meta_form_leads (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  leadgen_id text not null,
  form_id text not null default '',
  created_time timestamptz not null,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  ad_id text,
  ad_name text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  answers jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (tenant_id, leadgen_id)
);
alter table public.meta_form_leads enable row level security;

alter table public.tenants
  add column if not exists meta_form_leads boolean not null default false,
  add column if not exists meta_form_leads_synced_at timestamptz;

-- AAG: switch on, and fix the stored page (their ads run on 377819705421762;
-- the old id held another client's form).
update public.tenants
  set meta_form_leads = true, meta_page_id = '377819705421762'
  where id = '63c9dd32-3be2-4555-a043-a1d99a125ea3';

-- Edith Kinangs (AAG Meta lead 1792040005455934, never reached GHL): closed
-- for repairs and a tune-up, $250 (Jake, 2026-10-10). Same rows the tracker's
-- status dropdown and job value cell write.
insert into public.lead_status (tenant_id, contact_id, status, set_by, set_at)
values ('63c9dd32-3be2-4555-a043-a1d99a125ea3', 'meta:1792040005455934', 'won', 'owner', now())
on conflict (tenant_id, contact_id) do update set status = excluded.status, set_at = excluded.set_at;

insert into public.customer_jobs (tenant_id, ghl_contact_id, description, value_cents, completed_on, entered_from, created_by)
select '63c9dd32-3be2-4555-a043-a1d99a125ea3', 'meta:1792040005455934', 'Repairs and tune-up', 25000, date '2026-10-10', 'lead_tracker', 'owner'
where not exists (
  select 1 from public.customer_jobs
  where tenant_id = '63c9dd32-3be2-4555-a043-a1d99a125ea3'
    and ghl_contact_id = 'meta:1792040005455934' and entered_from = 'lead_tracker'
);
