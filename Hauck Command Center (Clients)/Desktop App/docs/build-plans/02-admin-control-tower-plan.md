# Admin Control Tower — Build Plan

Status: **Phases 0-2 BUILT (2026-06-16), uncommitted.** Phase 3 (chatbot) not started. The
tower (admin login, all-clients view, per-client people/access/content management) is code
complete and typechecks + builds clean. Two manual Supabase steps remain before it runs in
production (see "What shipped" at the bottom). Scope: one admin login, desktop only, that
sees and manages **every** client from above the per-client apps, plus a Claude chatbot that
answers questions, flips safe settings live, and hands off code/UI changes to the dev
workflow.

Decisions driving this plan (Jake, 2026-06-16):
- **One tower above the client apps.** A single admin login that sees all clients, the owner
  of each business, their assigned employees, and can change what each person is allowed to
  view. Desktop only.
- **Build lean, grow later.** Only the test account exists today; the tower scales with however
  many clients exist at the time. No over-engineering for a scale we don't have yet.
- **Lives inside the Desktop App (CRM).** Gated admin section of `crm.hauckmarketing.com`, not
  a separate site. Reuses the CRM's existing build, deploy, and auth plumbing. Can be split to
  its own `admin.` domain later if wanted.
- **Chatbot = hand-off, not a robot coder.** The bot answers questions and makes safe live
  changes (a client's enabled features, content/labels, who-can-see-what). For real UI/code
  changes it writes a structured task that **Claude Code** builds and tests on the test
  account; Jake approves; then it promotes to real clients. The bot never writes or ships code
  itself, and never touches a live client app directly.

---

## Reality check: what's already true (good news)

This is more feasible than it first looks. Confirmed in-repo:

- **One shared database holds every client.** A single Supabase has a `tenants` table with one
  row per client, each carrying that client's own GoHighLevel keys (`ghl_location_id`,
  `ghl_token`), branding, and spend. (`Mobile App/supabase/migrations/0001_init.sql`.) The
  tower does **not** need to reach into many separate databases.
- **The data model is already multi-tenant.** Everything is keyed by `tenant_id`:
  `tenant_users` (owner/manager/rep links), `tenant_entitlements` (per-client enabled
  features), `staff_accounts` + `staff_permissions` (per-employee grants), `activity_log`.
  Seeing "all clients and their people" is reading tables that already exist.
- **A half-built admin concept is sitting there.** `admins` table + `isAdmin()`
  (`migrations/0003_admins.sql`, `functions/lib/admin.ts`) already exists, explicitly marked
  "read-only across all tenants." It is the seed of the tower.
- **The permission model is real and server-enforced.** 3 layers — capability registry (code)
  → `tenant_entitlements` (per client) → `staff_permissions` (per employee) — checked in
  `functions/api/_middleware.ts` before any handler runs. The tower edits these same tables, so
  changing "what someone can view" flows through the existing enforcement automatically.
- **Backend is shared and deployed.** Cloudflare Pages `hauck-dashboard` at
  `dash.hauckmarketing.com` serves both the mobile app and the CRM via `/api/*`. The CRM is at
  `crm.hauckmarketing.com`.

### The one real obstacle

Each client's app is **pinned to a single tenant at deployment** via the `TENANT_SLUG` env var,
and the middleware resolves exactly one tenant per request (`functions/lib/env.ts`,
`functions/api/_middleware.ts`). So no existing door lets you act across clients. The tower is
that new door: a small set of admin-only endpoints that use the service-role key to read and
write across **all** `tenants` rows, deliberately bypassing the one-tenant pin — locked tightly
to verified admin sessions.

**Verdict:** moderate build. New admin auth + a cross-tenant admin API + a desktop admin UI +
a chatbot. No risky rewrite of the client apps.

---

## Phase 0 — Harden admin identity (prerequisite, not optional)

The current `isAdmin()` trusts a **client-supplied header** for identity — the code itself warns:
"do not put anything truly destructive behind it until identity is bound into the session."
The tower is the most destructive surface in the system (cross-client writes). So first:

1. **A real admin login** with its own credential (email + password; master key, so treat it as
   such). Separate from any client/owner/staff login.
2. **Bind admin identity into the signed session.** Extend the existing signed-session format
   (`functions/lib/session.ts`) so an admin session is cryptographically marked, not asserted by
   a header. Verified in middleware like everything else.
3. **An audit trail.** Every admin write (toggle a feature, change a permission, edit content,
   create a client) appends to `activity_log` (or a dedicated `admin_audit_log`) with who/what/
   when. The master key leaves footprints.

Recommend (later, before this is widely used): 2FA on the admin login.

---

## Phase 1 — Cross-tenant admin API

A new, isolated set of `/api/admin/*` routes, reachable **only** by a verified admin session,
that operate across all tenants using the service-role key (not the per-tenant pin).

- `GET /api/admin/clients` — list every client: name, niche, monthly spend, # of employees,
  enabled features, GHL location (never the token).
- `GET /api/admin/clients/:id` — one client in full: owner, all employees + their roles + their
  per-surface permissions, the client's enabled features, recent activity, spend.
- `PATCH /api/admin/clients/:id/entitlements` — turn a client's features on/off
  (writes `tenant_entitlements`).
- `PATCH /api/admin/staff/:id/permissions` — change what an employee can view/edit
  (writes `staff_permissions`, validated against the client's enabled set, same rules the app
  already enforces).
- `POST /api/admin/clients` — register a new business (seed a `tenants` row + owner). This is the
  "I registered a business in there" flow.
- (Content/label edits ride on the existing per-tenant fields, e.g. `app_name`, `won_label`,
  `value_label`, branding — exposed through the same client-detail PATCH.)

Guardrails: these endpoints are the crown jewels. They live behind the Phase-0 admin session
check, are physically separated from the per-tenant middleware path, and every write is audited.

---

## Phase 2 — Admin desktop UI (inside the CRM)

A gated admin section of the Desktop App. An admin login lands straight here; nobody else sees it.

- **All Clients** — a table of every business: name, niche, owner, # employees, spend, enabled
  features, status. Search/sort. Click through to detail.
- **Client detail** — the heart of it:
  - Owner and all assigned employees, each with their role and a live editor for what they can
    view/edit (the permission matrix, writing through Phase 1).
  - Feature toggles for the whole client (entitlements).
  - Editable content/labels/branding for that client's app.
  - Recent activity + spend.
- **Register a business** — the create-client flow (Phase 1 `POST`).
- Built with the `frontend-design` skill, matching the CRM's existing "Console" look.

No mobile build (per the decision). No separate domain to start.

---

## Phase 3 — The Claude chatbot

A chat panel inside the admin view, backed by the Claude API (latest model chosen at build
time; see `claude-api` reference). Three capability tiers, increasing in caution:

1. **Answer & find (read).** "Which clients have billing turned off?" "Who are Willis's
   employees?" The bot calls the Phase 1 read endpoints as tools and answers. Zero risk.
2. **Safe live changes (write, with confirmation).** "Turn off the pipeline for client X."
   "Rename their Won label to Booked." "Give Sarah edit access to contacts." The bot calls the
   Phase 1 write endpoints, always shows the change and asks for a yes before committing, and
   the write is audited. These are reversible config/content/permission changes only.
3. **Code / UI changes (hand-off, never direct).** "Make the dashboard header bigger." The bot
   does **not** write code. It captures the request as a structured task (target = test account)
   and drops it where a Claude Code dev session picks it up. Claude Code builds and tests it on
   the **test account**, Jake reviews, then it's promoted to real clients through the normal
   ship path. The live client apps are never edited by the bot.

This keeps the exact workflow Jake and Claude Code already run, just initiated from the admin
chat — without rebuilding a code-writer inside a live web app.

---

## Risks & guardrails (the short version)

- **The admin API is the master key.** Mitigated by Phase 0 (session-bound identity), strict
  isolation of `/api/admin/*`, and a full audit trail. Do Phase 0 first, always.
- **Cross-tenant writes can bleed data if scoped wrong.** Every admin write names its target
  tenant explicitly; reads never leak `ghl_token`.
- **The bot must not be able to ship code or hit a live client app.** Tier 3 is hand-off only,
  by design. Tier 2 writes are reversible config and always confirmed.

---

## Open items needing Jake

- **One database, confirm:** the plan assumes every client deployment points at the **one**
  shared Supabase project. Almost certainly true given the schema, but I'll verify before
  building the cross-tenant endpoints.
- **Admin login shape:** email + password to start, add 2FA before heavy use — agree? Any
  preference on the credential?
- **Where hand-off tasks land:** a Supabase table the bot writes and Claude Code reads, or a
  simple task file in the repo? (Leaning Supabase table so the admin UI can show task status.)
- **Build order:** I'd ship Phase 0→1→2 (the tower you can actually use) before Phase 3 (the
  bot). Good with that, or do you want the chatbot sooner?

---

## What shipped (2026-06-16)

Built against the Mobile App backend (`functions/`) + the Desktop App CRM (`crm-web`) + shared
`@hauck/core`. All cross-tenant reads/writes go through the service-role client and a
session-bound admin identity; every admin write is audited.

**Backend (`Hauck Command Center (Clients)/Mobile App`):**
- `supabase/migrations/0008_admin_accounts.sql` — `admin_accounts` + `admin_audit_log`.
- `functions/lib/adminAuth.ts` — `getActiveAdmin`, `getTenantById`, `logAdminAction`.
- `functions/lib/session.ts` — admin sessions (`<exp>.admin.<adminId>`), signed like staff.
- `functions/api/auth/admin-login.ts` — email+password → admin session (rate-limited).
- `functions/api/_middleware.ts` — gates `/api/admin/*` to a verified admin; `/api/auth/me`
  now reports `isAdmin`.
- `functions/api/admin/clients/*` — list/create clients, detail/edit, entitlement toggle,
  staff create/update/disable. All cross-tenant.

**Frontend (`Desktop App`):**
- `AuthContext` (isAdmin + signInAdmin), `Login` (quiet "Admin access" link), `App`/`Sidebar`
  (admin-only nav + RequireAdmin, admins land on `/admin`).
- `routes/admin/AdminClients.tsx` (all-clients list + register-a-business) and
  `routes/admin/AdminClientDetail.tsx` (people, per-employee permission editor, feature
  toggles, editable content/branding/GHL connection, recent activity).
- `hooks/useApi.ts` admin queries/mutations; `@hauck/core` admin types.

**MANUAL STEPS before it works in production (Supabase SQL editor):**
1. Run `0008_admin_accounts.sql`.
2. Run the one-time admin seed INSERT (provided separately — it carries a PBKDF2 password hash
   and is deliberately NOT committed). Re-runnable; upserts on email.
3. No new env vars: the admin path reuses `SESSION_SECRET` + `SUPABASE_*`, already set wherever
   staff login works. The tower sees every client in that one shared Supabase.

**Assumption to confirm:** all client deployments point at the **one** Supabase project that
holds the `tenants` table. True today (single deployment). If clients are ever split onto
separate Supabase projects, the tower must run against a shared one.

**Security notes:** admin identity is bound into the signed session (not a header); `/api/admin/*`
is isolated from the per-tenant pin and rejects any non-admin session; `ghl_token` is never
returned to the browser; every write lands in `admin_audit_log`. Recommended next: 2FA on admin
login before heavy use.
