-- 0044: setter_scripts, one formatted dialing script per client.
--
-- The Setter Suite's Settings tab replaces the retired Dialing Hub tab
-- (0042's setter_dial_hub table stays in place, dormant, in case its pasted
-- links are still wanted). The only setting today is the dialing script,
-- written and formatted in-app (bold, headings, lists) and rendered in the
-- cockpit's script overlay.
--
-- The column holds sanitized HTML. functions/lib/setterScript.ts is the
-- trust boundary: every write passes through its allowlist sanitizer, so the
-- column can only ever hold markup the cockpit is safe to render. The read
-- path renders it verbatim on that guarantee.
--
-- ACCEPTED LIMITATION: last write wins, same as the dial hub before it. One
-- writer (the agency) in practice.
--
-- Run AFTER 0001..0043. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated
-- in _middleware.ts).

create table if not exists public.setter_scripts (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  html       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_accounts(id) on delete set null
);

alter table public.setter_scripts enable row level security;
-- No policies: service-role only.

comment on table public.setter_scripts is
  'One formatted dialing script per client for the Setter Suite Settings tab. Sanitized in functions/lib/setterScript.ts before every write.';
