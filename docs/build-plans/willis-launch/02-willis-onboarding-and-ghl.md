# Plan 02 — Willis onboarding: tenant, branding, GHL, owner + staff (LAUNCH track)

**You are one of several Claude instances. Read `00-INDEX.md` first** for shared context,
house rules, and locked decisions. Address Jake as **"Sir"**. **No em dashes.**
**Ask clarifying questions** for every Willis-specific value below; do not invent branding,
labels, emails, or pipeline assumptions.

**Depends on Plan 01** (Supabase current, env set, admin login works, app deployed).

## Goal

Make Willis Windows a fully configured client: a `tenants` row with correct branding, GHL
sub-account wired, the owner's login created, staff/reps added, and the right surfaces
(entitlements) enabled. Do this through the **admin view** (the Desktop App's `/admin`
screens) wherever possible, so the flow Jake will reuse for future clients is exercised.

## START HERE: collect Willis's details from Jake

Ask Jake for all of these before configuring (the seed file has placeholders that MUST be
confirmed, see `Mobile App/supabase/seeds/willis-windows.sql`):

- **Display name** (default "Willis Windows") and **app name** shown in the app header
  (seed says "Willis Leads" — confirm).
- **Brand color** (hex; seed default `#1d6fb8`), **initials** (default "WW"), and a **logo**
  if there is one.
- **Won label** (seed "Won"; e.g. "Job Booked"?) and **value label** (seed "Job Value").
- **Niche** (seed "home-services").
- **Owner login:** name + email + a starting password.
- **Staff/reps to add:** for each, name, email, role (owner/manager/rep), and which surfaces
  they may view/edit.
- **GHL sub-account:** confirm location id (`.env.local` has `OznT3yyuwK3dqVXDsCaD`) and that
  its token has scopes for opportunities, contacts, conversations (read/write).
- **Which surfaces Willis sees** (entitlements). Capability keys live in
  `Mobile App/functions/lib/permissions.ts`: `overview, paid_ads, pipeline, inbox, contacts,
  calendar, billing, activity`. Ask which to enable for Willis at launch.
- **Timezone** for "today" calculations.

## Work

### A. Create the Willis tenant
- Preferred: via the admin view (`POST /api/admin/clients`) so the real flow is tested. The
  create endpoint accepts branding, labels, GHL creds, and (now) an **owner email + password**
  that creates the owner login in one step (`Mobile App/functions/api/admin/clients/index.ts`).
- Alternative: adapt `supabase/seeds/willis-windows.sql` with confirmed values (note: that
  seed predates the owner-account model; prefer the admin endpoint).
- Set `slug = willis-windows`. GHL creds: either store Willis's real creds on the tenant row,
  or leave them as the `env` placeholder so the backend uses the Cloudflare `GHL_*` env vars
  (single-client launch). Confirm which with Jake; for multiple clients later, per-tenant
  creds are required.

### B. Owner + staff accounts
- Ensure the **owner** account exists (role `owner`, email + password). Owners bypass
  per-surface checks.
- Add reps/managers via the admin staff UI (`POST /api/admin/clients/:id/staff`) with
  per-capability view/edit permissions, OR use **Import from GHL**
  (`POST /api/admin/clients/:id/import-staff`) to pull Willis's existing GHL users, then set
  passwords/permissions. Test the import path; report `{ imported, skipped }`.
- **Emails are globally unique across all clients** (migration 0010). If an import or add
  fails on a duplicate email, surface it to Jake.

### C. Entitlements (Willis's "view")
- Enable exactly the surfaces Jake chose, via the admin Features toggles
  (`PATCH /api/admin/clients/:id/entitlements`). Disabled surfaces are hidden + access-denied
  for staff automatically (effective perms = staff grants ∩ tenant entitlements).

### D. Verify GHL data path (read-only sanity)
- With the Willis creds active, confirm the backend can read Willis's GHL: hit (authenticated)
  `/api/leads`, `/api/contacts`, `/api/conversations`, `/api/calendar/events` and confirm
  real Willis data returns (not the test account, not empty). The GHL routes live under
  `Mobile App/functions/api/`. Confirm pipeline stage names match Willis's actual GHL pipeline
  and that the Won label matches.

## Definition of done
- Willis exists as a tenant with confirmed branding + labels.
- Owner login works (verified in Plan 03's test, but the account exists now).
- Reps added with correct, least-privilege permissions.
- Enabled surfaces match Jake's choice.
- Authenticated API calls return Willis's real GHL data with correct stage/Won labels.

## MANUAL ACTIONS — JAKE MUST DO
1. Provide every value in "collect Willis's details" above.
2. In GoHighLevel: confirm/grant the private-integration token scopes if any read fails.
3. Decide initial passwords for owner/reps (or have this Claude generate strong ones to share
   with each person securely; never commit them).

## Manual actions ALREADY DONE FOR YOU
- Admin create-client endpoint already supports creating the owner login in one step.
- Account-based login means each person logs in with their own email + password; no per-client
  URL needed.
