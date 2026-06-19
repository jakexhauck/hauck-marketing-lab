# Willis Windows Launch, Master Index

> One product: the **Command Center**. One responsive app: desktop sidebar layout at `lg`+,
> phone PWA below, same backend. Goal of this plan set: get **Willis Windows** fully live,
> then add push.
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

- `command-center/app/`: package `client-dashboard`. The ONE responsive app: the React PWA
  **and** the Cloudflare Pages Functions backend (`functions/`) + Supabase schema
  (`supabase/`). It renders a desktop sidebar layout at `lg`+ and a phone PWA below, and owns
  the API. This is the only Command Center build.
- (Retired) The old `Desktop App` (package `crm-web`) and `packages/core` were DELETED in the
  Plan 04 merge. Their desktop-first layout, views, and admin console were folded into
  `command-center/app`.
- Repo root `app/` is a DIFFERENT product (the agency's Tauri app). Do not touch it.

## Locked decisions (from the planning session, 2026-06-19)

- One URL: **`app.hauckmarketing.com`** for clients and admin. Admin is a gated section of
  the same app, not a separate app. The Cloudflare Pages project is named **`hauck-command-center`**.
- Login is **email + password per person**. No per-client subdomains. No shared passwords
  (the old shared-password owner login stays only as a single-tenant fallback).
- **One responsive codebase**: the merge is DONE. The desktop sidebar layout and the phone
  PWA are the same app (`command-center/app`), not two builds.
- Willis's team uses the desktop sidebar layout (full CRM) and the phone; Jake also tests the
  client view and tunes the admin view.
- Per-client GHL credentials live on the **tenant row** (set via the admin console), NOT in
  Cloudflare env. There is no `TENANT_SLUG` and no `GHL_*` in Cloudflare env.
- **Push notifications are the last phase** (Plan 06).
- DNS is at **Namecheap** (apex `hauckmarketing.com`); Cloudflare gives a CNAME target.

## Already done (do not redo)

- **Plan 01 (infra) complete and verified:** Cloudflare Pages project `hauck-command-center`
  builds and serves the app + API; global env secrets set; Jake's super-admin login exists.
- **Plan 04 merge done and deployed (2026-06-19):** the two builds are now ONE responsive app
  at `command-center/app`. The old `Desktop App` (`crm-web`) and `packages/core` were deleted.
- **Migrations `0001` through `0011` are ALL applied** to Supabase (numbering skips `0002`,
  which never existed). `0010` makes staff emails globally unique; `0011` adds
  `tenants.notify_audience`.
- **`app.hauckmarketing.com` is LIVE** (HTTPS; `/api/auth/me` returns 401 when logged out).
- **Rebrand:** all visible "CRM"/"Control Tower"/"Dashboard" strings are now "Command Center".
- **Account-based login (backend):** session token carries `tenant_id`; live login resolves
  the client by email globally; middleware + `me.ts` prefer the session tenant. Files:
  `command-center/app/functions/lib/session.ts`, `.../api/auth/staff-login.ts`,
  `.../api/auth/login.ts`, `.../api/_middleware.ts`, `.../api/auth/me.ts`,
  `.../lib/tenantResolve.ts`.
- **Admin create-client** can also create the owner login account (email + password).

## Launch status (2026-06-19): what changed

- **One responsive app, merge done.** Plan 04 shipped. The two builds collapsed into one app
  that renders a desktop sidebar at `lg`+ and a phone PWA below. The old `Desktop App`
  (`crm-web`) and `packages/core` were deleted.
- **Folder renamed.** "Hauck Command Center (Clients)/Mobile App" became `command-center/app`
  (package name still `client-dashboard`). Reason: Cloudflare Pages path fields reject
  parentheses and the special characters `;|&()<>`, so the parenthesised path was unusable.
- **Cloudflare Pages project `hauck-command-center`.** Build config: Root directory
  `command-center/app`, Build command `pnpm run build`, Build output `dist`. The `functions/`
  dir auto-routes the API. `wrangler.toml` in that folder names the project and sets
  `pages_build_output_dir = "dist"`.
- **`app.hauckmarketing.com` is live (HTTPS).** It previously served a GoHighLevel page; its
  Namecheap CNAME was repointed to the Pages project. Dead origins now:
  `commandcenter.hauckmarketing.com`, `dash.hauckmarketing.com`, `hauck-crm.pages.dev`. The
  old `hauck-crm` Cloudflare Pages project still needs deleting by Jake.
- **Migrations `0001`-`0011` all applied** (numbering skips `0002`, which never existed).
  `0010` = globally unique staff emails; `0011` = `tenants.notify_audience`. Jake's
  super-admin login exists in `admin_accounts`.
- **Env strategy:** per-client GHL credentials live in the tenant ROW (set via the admin
  console), NOT in Cloudflare env. No `TENANT_SLUG`, no `GHL_*` in Cloudflare. Global secrets
  only: `SESSION_SECRET`, `APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `WEBHOOK_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION`,
  `PNPM_VERSION`. VAPID keys remain empty (Plan 06).
- **Admin shipped.** Plan 05 (admin login + in-app console) is live in
  `command-center/app/src/routes/admin/`, including the staff/owner editor (role, password,
  per-surface permissions, owner grouping) and the "preview as client" read-only mode
  (button on the client detail + app-wide exit banner, shipped 2026-06-19). Plan 05 is
  fully done.
- **Plan 04 CORS residual done.** Dead origins dropped from
  `command-center/app/functions/api/_middleware.ts` (2026-06-19); only
  `app.hauckmarketing.com`, the Pages default domain, and local dev remain. The Cloudflare
  dashboard cleanup (delete old `hauck-crm` project, redirect dead origins) is still Jake's.
- **Plan 06 VAPID keys generated** (2026-06-19, P-256) and stored in the gitignored
  `command-center/app/.env.local`. Still need pasting into Cloudflare Pages Production env
  and a redeploy; see `RUNBOOK-push.md`.

## Plans + dependency order

| # | Plan | Track | Status | Remaining |
|---|------|-------|--------|-----------|
| 01 | Infra: migrations, Cloudflare env, admin account, domains, deploy | LAUNCH | DONE (file removed) | nothing |
| 02 | Willis onboarding: tenant, branding, GHL wiring, owner + staff accounts | LAUNCH | DONE (file removed) | nothing; Willis tenant live, branding/labels confirmed, both owners (Joshua + Jayse) created, GHL data path verified ("Job Booked" is a real stage) |
| 03 | Login UX (email+password) + full end-to-end launch validation | LAUNCH | ~40% done, NEXT ACTIONABLE | login UX shipped; decisions resolved (keep test mode, one form for everyone, preview-as-client built + deployed). REMAINING: Jake runs the validation matrix (owner + rep, desktop + installed PWA) + sign-off |
| 04 | Unify into ONE responsive Command Center; retire `crm-web` | MERGE | DONE (file removed) | code residual DONE (dead CORS origins dropped 2026-06-19). OUTSTANDING (Jake): delete old `hauck-crm` CF project; redirect dead origins (`commandcenter`/`dash`/`hauck-crm.pages.dev`) to `app.hauckmarketing.com` |
| 05 | Admin view inside the one app (full per-client config controls) | MERGE | DONE (file removed) | fully done: staff/owner-edit UI + "preview as client" read-only mode (UI wired to `preview.ts`/`exit-preview.ts` + exit banner), both shipped 2026-06-19 |
| 06 | Push notifications + offline polish | AFTER | NOT STARTED (~0%) | generate/set VAPID, wire+register webhook, test push + offline. See `RUNBOOK-push.md` |

**Next up:** Plan 03 is the launch gate, now unblocked (Plan 02 done). Run the validation
matrix + Jake sign-off = Willis launched. Carried-over residuals from removed plans: Plan 04
Cloudflare cleanup + dead-CORS code change; Plan 05 optional "preview as client" mode. Plan 06
(push) is last.

## Definition of "Willis is launched"

Willis's owner and at least one rep can log in at the live URL on **both** a desktop browser
and an **installed phone PWA**, see Willis's real GHL data (leads, conversations, calendar),
the rep sees only what they're permitted, and Jake can manage Willis from the admin view.
