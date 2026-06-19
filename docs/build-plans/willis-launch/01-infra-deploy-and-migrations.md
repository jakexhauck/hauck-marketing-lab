# Plan 01 — Infra: migrations, env, admin account, domains, deploy (LAUNCH track)

**You are one of several Claude instances working a launch. Read `00-INDEX.md` in this
folder first for shared context, house rules, repo layout, and the locked decisions.**

Address Jake as **"Sir"**. **No em dashes anywhere.** **Ask clarifying questions** before and
during this work; do not guess at infrastructure values.

## Goal

Stand up the shared infrastructure so Willis can be onboarded (Plan 02) and validated
(Plan 03) on the **existing two builds**: Supabase schema current, Cloudflare env/secrets
set, a super-admin login created, the project renamed to `hauck-command-center`, and both
builds deployed and reachable.

This plan does NOT do the responsive merge (that's Plan 04). It launches what exists.

## START HERE: verify current state, then ask Jake

The live system may be further along than the docs imply (login has been tested before).
**Do not assume a clean slate.** First determine, then confirm with Jake:

1. Which Cloudflare Pages projects exist today and their domains. Expected: `hauck-dashboard`
   (the Mobile App + backend; likely live) and `hauck-crm` (the Desktop App; may not be live).
2. Which Supabase migrations are already applied. Login working before implies `0001`-`0009`
   are applied; **`0010_global_email_login.sql` is new and almost certainly NOT applied.**
3. Whether a `admin_accounts` row already exists for Jake.

**Clarifying questions to ask Jake up front:**
- "Is the mobile app already deployed and is login working in production today?"
- "What is the Supabase project (URL), and do you want me to give you SQL to run, or do you
  have the supabase CLI linked so migrations can be pushed?"
- "Launch topology: clients install the phone app at `app.hauckmarketing.com`. Where should
  the **desktop** build live until the merge (Plan 04) collapses everything to one URL?
  Recommended: keep `commandcenter.hauckmarketing.com` for desktop now, fold into
  `app.hauckmarketing.com` at the merge." (The backend lives with the mobile project; the
  desktop build calls it cross-origin, so its origin must be in CORS.)
- "What email + name do you want on your super-admin login?"

## Work

### A. Supabase migrations
- Confirm `0001`-`0009` are applied. Apply **`0010_global_email_login.sql`**
  (`Mobile App/supabase/migrations/`). It makes `lower(email)` unique across ALL
  `staff_accounts` and **fails loudly if an email already spans two tenants** (resolve any
  duplicate first). If the supabase CLI is linked, push; otherwise hand Jake the SQL.

### B. Super-admin login
- A helper script is ready: `scripts/make-admin-account.mjs` (repo root). Run:
  `node scripts/make-admin-account.mjs "<name>" <email> "<password>"` and give Jake the
  printed INSERT to run in Supabase. The hash matches the app's PBKDF2 scheme, so the
  account can sign in via the Admin tab immediately. The plaintext password is never written
  to disk or git.

### C. Cloudflare env / secrets (on the project that hosts `functions/`)
Set every backend var. Source of truth: `Mobile App/functions/lib/env.ts` + `.env.example`.
- Plain: `NODE_VERSION=20`, `PNPM_VERSION=10`, `TENANT_TIMEZONE` (Willis's timezone, ask).
- Secrets: `APP_PASSWORD`, `SESSION_SECRET` (32+ random), `GHL_LOCATION_ID`, `GHL_TOKEN`
  (Willis's live sub-account), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_SECRET`,
  plus `TEST_*` if a test account is kept. Frontend: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.
- **Leave `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` empty for now** (push is Plan 06).
- The local `.env.local` (`Mobile App/.env.local`) already has working Willis values to copy
  from. Confirm with Jake that `GHL_LOCATION_ID=OznT3yyuwK3dqVXDsCaD` is Willis's real live
  sub-account before relying on it.

### D. Rename project + domains
- Rename the Cloudflare Pages project that hosts the app+API to **`hauck-command-center`**
  (Jake approved). Update `wrangler.toml` `name` to match.
- Custom domain **`app.hauckmarketing.com`** on that project.
- Desktop build origin (e.g. `commandcenter.hauckmarketing.com`) per Jake's answer above.
- Update the **CORS allowlist** in `Mobile App/functions/api/_middleware.ts` to the final
  origins (add `https://app.hauckmarketing.com`; keep the desktop origin; drop dead ones).

### E. Deploy both builds
- Mobile/backend: build from the workspace, output `dist`, Functions auto-route.
- Desktop (`crm-web`): set `VITE_API_BASE` to the backend origin (`https://app.hauckmarketing.com`),
  build, deploy to its project. Confirm it can reach `/api/*` (CORS).

## Definition of done
- `app.hauckmarketing.com` serves the app over HTTPS; `/api/auth/me` returns 401 (not 500)
  when logged out (proves Supabase + env are wired).
- Jake can sign in on the **Admin** tab with his new super-admin account.
- The desktop build loads and can hit the API without CORS errors.
- Migration `0010` is applied.

## MANUAL ACTIONS — JAKE MUST DO (external systems, no repo access)
1. **Supabase:** run the migration SQL and the admin-account INSERT this Claude gives you
   (Supabase SQL editor), OR link the supabase CLI so it can push.
2. **Cloudflare:** set all env vars/secrets in the Pages project dashboard.
3. **Cloudflare:** rename the project to `hauck-command-center`.
4. **Cloudflare:** add custom domain `app.hauckmarketing.com` (and the desktop origin).
5. **Namecheap:** add the CNAME record(s) Cloudflare shows for those domains.
6. Tell this Claude the Supabase URL + confirm the Willis GHL location id.

## Manual actions ALREADY DONE FOR YOU (by the planning agent)
- `scripts/make-admin-account.mjs` written and tested (generates the admin INSERT).
- `0010_global_email_login.sql` written (still needs applying in step 1).
- Account-based login backend already implemented.
