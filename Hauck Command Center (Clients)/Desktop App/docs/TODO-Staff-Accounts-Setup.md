# Manual setup: Staff Accounts & Permissions

The staff-accounts feature is fully built and merged. This file is the short list of
hands-on steps left for you to do when you're ready to turn it on. Nothing here is
code. Do them in order.

Full design reference (if you want the why): `docs/Staff-Accounts-and-Permissions.md`.

---

## Required steps

- [ ] **1. Apply the database migration.**
  Run `client-dashboard/supabase/migrations/0007_staff_accounts.sql` against your
  Supabase project (live, and the test project if you use one). It is idempotent,
  so re-running it is safe. This creates the staff, entitlements, and permission
  tables and seeds the current surfaces for existing businesses.

- [ ] **2. Confirm the live business row exists in Supabase.**
  In the `tenants` table, make sure there's a row whose `slug` matches your
  `TENANT_SLUG` env var (the `test-account` row already exists from an earlier
  migration). Staff are scoped to this row. If it's missing, staff login fails
  with "tenant not found."
  Note: if you add the live business row *after* step 1, re-run migration `0007`
  so its entitlements get seeded.

- [ ] **3. Set `SESSION_SECRET` on the backend.**
  On the `client-dashboard` Cloudflare Pages project, set a `SESSION_SECRET`
  environment variable (any long random string) if one isn't already set. It
  signs the login sessions.

- [ ] **4. Deploy both projects.**
  Deploy the backend (`client-dashboard`) and the web CRM (`crm-web`). They share
  the backend but are separate Pages projects.

---

## Optional step

- [ ] **5. Enable GoHighLevel user creation.**
  If you want each new staff member to also be created as a GHL user automatically:
  - Set `GHL_COMPANY_ID` (your agency/company id) on the backend.
  - Make sure the GHL token you use has the `users.write` scope.

  Skip this and staff accounts still work completely. They just won't be linked to
  a GHL user (the Team screen shows a small "unlinked" icon next to them). You can
  enable this later at any time.

---

## How to use it once live

- There's no separate owner account to create: your existing owner password login
  is treated as the owner.
- Sign in with the owner password, open the new **Team** screen in the web CRM, and
  click **Add staff**. Enter their name, email, password, role, and flip the
  view/edit toggles for each surface.
- Staff sign in from the same login screen using the **Staff** tab (email +
  password).

## Quick smoke test

- [ ] Add a test staff member with access to only one or two surfaces.
- [ ] Sign out, then sign back in via the **Staff** tab with their email/password.
- [ ] Confirm they only see the surfaces you granted, and can only edit where you
      gave edit rights.
- [ ] Back as the owner, open that staff member and click **Disable login**;
      confirm they can no longer sign in.
