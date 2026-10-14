-- =========================
-- 0019: client product-tour progress
-- =========================
-- The first-login walkthrough (client product tour) remembers how far each
-- person has gotten so it does not re-run on their other device. One row per
-- person per tenant, holding the highest tour version they have completed.
--
-- person_key is the staff id for staff sessions, or the owner's chosen GHL
-- identity id (falling back to "owner") for shared-password sessions. It is
-- only a per-person bucket WITHIN an already-authenticated tenant; it never
-- carries authority on its own.

create table if not exists public.tour_progress (
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  person_key        text not null,
  completed_version int  not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (tenant_id, person_key)
);
