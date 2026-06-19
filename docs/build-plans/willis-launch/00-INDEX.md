# Willis Windows Launch — Master Index

> One product: the **Command Center**. A **desktop version** and a **mobile version**,
> same backend, fully in sync. Goal of this plan set: get **Willis Windows** fully live on
> both, then collapse the two builds into one responsive codebase, then add push.
>
> Each numbered file is a **self-contained handoff plan for a separate Claude instance.**
> Hand them out in dependency order (below). Every plan tells its Claude to **ask Jake
> clarifying questions before and during the work** and ends with a **manual-action
> checklist** split into "Jake must do" vs "already done for you".

## House rules (every Claude working in this repo)

- Address the user as **"Sir"** (or "Ma'am" if told). Calm, precise, dry. No fluff.
- **Never use em dashes (`—`)** anywhere: chat, code, comments, UI, docs. Use commas,
  periods, parentheses, colons.
- Read `CLAUDE.md` at the repo root and the vault notes it points to before writing copy.
- **Ask clarifying questions** whenever a detail is ambiguous. Getting it 100% right beats
  guessing. Use the AskUserQuestion tool for decisions; ask in plain text for data (emails,
  hex colors, etc.).
- Confirm before destructive or outward-facing actions (deploys, DNS, deletes).

## The product, in one paragraph

The Command Center is a multi-tenant client portal over GoHighLevel (GHL). One Cloudflare
Pages project hosts the app **and** its API (`functions/`), backed by Supabase (tenant +
staff + permissions data). Each client (e.g. Willis Windows) is a `tenants` row. People log
in with **their own email + password**; the account decides which client they see (account-
based login, already built). Owners are `staff_accounts` rows with role `owner`; staff get
per-surface permissions. A super-admin (Jake) gets a cross-tenant admin view to set up and
configure clients.

## Repo layout

- `command-center/Mobile App/` — package `client-dashboard`. The React PWA
  **and** the Cloudflare Pages Functions backend (`functions/`) + Supabase schema
  (`supabase/`). This project owns the API and is the base for the future single app.
- `command-center/Desktop App/` — package `crm-web`. React SPA, desktop-first
  CRM + the admin console. No backend of its own; calls the Mobile App's `/api/*`.
- `packages/core/` — shared types/permissions used by the desktop build.
- Repo root `app/` is a DIFFERENT product (the agency's Tauri app). Do not touch it.

## Locked decisions (from the planning session, 2026-06-19)

- One URL: **`app.hauckmarketing.com`** for clients and admin. Admin is a gated section of
  the same app, not a separate app. Rename the Cloudflare project to **`hauck-command-center`**.
- Login is **email + password per person**. No per-client subdomains. No shared passwords
  (the old shared-password owner login stays only as a single-tenant fallback).
- **Launch first on the existing two builds**, then merge into one responsive codebase.
- Willis's team uses the **desktop version** (full CRM) and the phone; Jake also tests the
  client view and tunes the admin view.
- **Push notifications are the last phase** (Plan 06), added after launch + merge.
- DNS is at **Namecheap** (apex `hauckmarketing.com`); Cloudflare gives a CNAME target.

## Already done (do not redo)

- **Rebrand:** all visible "CRM"/"Control Tower"/"Dashboard" strings are now "Command Center".
- **Account-based login (backend):** session token carries `tenant_id`; live login resolves
  the client by email globally; middleware + `me.ts` prefer the session tenant. Files:
  `Mobile App/functions/lib/session.ts`, `.../api/auth/staff-login.ts`, `.../api/auth/login.ts`,
  `.../api/_middleware.ts`, `.../api/auth/me.ts`, `.../lib/tenantResolve.ts`.
- **Migration `0010_global_email_login.sql`:** makes `lower(email)` unique across all
  `staff_accounts` (not yet applied to Supabase — see Plan 01).
- **Admin create-client** can also create the owner login account (email + password).

## Plans + dependency order

| # | Plan | Track | Depends on |
|---|------|-------|-----------|
| 01 | Infra: migrations, Cloudflare env, admin account, domains, deploy both builds | LAUNCH | — |
| 02 | Willis onboarding: tenant, branding, GHL wiring, owner + staff accounts | LAUNCH | 01 |
| 03 | Login UX (owner = email+password) + full end-to-end launch validation | LAUNCH | 01, 02 |
| 04 | Unify into ONE responsive Command Center (mobile base); retire `crm-web` | MERGE | launch live (01-03) |
| 05 | Admin view inside the one app (full per-client config controls) | MERGE | 04 |
| 06 | Push notifications + offline polish | AFTER | 04, 05 |

**Launch = Plans 01 → 02 → 03 complete.** Then 04 → 05. Then 06.

## Definition of "Willis is launched"

Willis's owner and at least one rep can log in at the live URL on **both** a desktop browser
and an **installed phone PWA**, see Willis's real GHL data (leads, conversations, calendar),
the rep sees only what they're permitted, and Jake can manage Willis from the admin view.
