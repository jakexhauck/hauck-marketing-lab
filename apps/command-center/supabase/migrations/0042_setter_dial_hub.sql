-- 0042: setter_dial_hub, one editable dialing reference per client.
--
-- The Setter Suite's Dialing Hub tab: the script link, the manual booking
-- calendars, the CRM tag strings a setter pastes, the SOP link. It replaces a
-- Google Sheet that had to be kept open in another window and maintained by
-- hand per client.
--
-- The whole document lives in ONE jsonb column rather than a row per entry
-- because the structure itself is user-editable: sections and rows are added,
-- deleted, relabelled and re-sectioned by the admin. Modelling each row
-- relationally would buy an ordering column and a delete-diff on every
-- keystroke-debounced save, for a document that is tens of rows and has
-- exactly one writer. The shape is defined and enforced in
-- functions/lib/dialHub.ts (normalizeHub), which is the trust boundary: this
-- column is never read without passing through it.
--
-- ACCEPTED LIMITATION: last write wins. Two admins editing one client's hub in
-- two tabs would have one clobber the other. Only the agency edits these, and
-- conflict resolution is not worth its cost today.
--
-- A tenant with no row here is not an error: the API returns the seed template
-- (DEFAULT_HUB) so a new client opens on the right rows rather than a blank
-- page. A row appears the first time someone edits.
--
-- Run AFTER 0001..0041. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated
-- in _middleware.ts).

create table if not exists public.setter_dial_hub (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  hub        jsonb not null default '{"sections":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_accounts(id) on delete set null
);

alter table public.setter_dial_hub enable row level security;
-- No policies: service-role only.

comment on table public.setter_dial_hub is
  'One editable Dialing Hub document per client for the Setter Suite. Shape enforced in functions/lib/dialHub.ts, not by the DB.';
