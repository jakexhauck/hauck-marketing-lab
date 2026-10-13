-- 0165: an onboarding form made for a client who already exists.
--
-- Closing a deal in Sales Data now creates the client on the spot (2026-10-13,
-- Jake), then opens an onboarding form for them, prefilled from the call. Its
-- resume link is the personal link Jake sends. When that form is submitted,
-- approval fills THIS client (owner login, answers) instead of making a second
-- one. Null on every form a stranger starts from the public page.
--
-- Idempotent.

alter table public.intake_submissions
  add column if not exists for_tenant_id uuid references public.tenants (id) on delete set null;

create index if not exists intake_submissions_for_tenant_idx
  on public.intake_submissions (for_tenant_id) where for_tenant_id is not null;
