# Plan 04 — Unify into ONE responsive Command Center (MERGE track)

> **STATUS: DONE (merged and deployed 2026-06-19).** The two builds are now ONE responsive app
> at `command-center/app` (package `client-dashboard`): desktop sidebar layout at `lg`+, phone
> PWA below. The old `Desktop App` (`crm-web`) and `packages/core` were DELETED. The only
> things left are the residual cleanup in "Residual cleanup (outstanding)" below. The rest of
> this plan is kept for reference on how the merge was done.

**You are one of several Claude instances. Read `00-INDEX.md` first.** Address Jake as
**"Sir"**. **No em dashes.**

## Goal (achieved)

Collapsed the two builds into **one responsive codebase** served at `app.hauckmarketing.com`:
one app that lays out wide on desktop (sidebar + multi-column) and installs as a PWA on
phones (bottom nav), same login, same data, same backend. The old `Desktop App` (`crm-web`)
was retired. The admin view comes in Plan 05.

## Why `command-center/app` was the base
`command-center/app` (`client-dashboard`) owns the backend (`functions/`), the PWA/offline
infra, and was feature-complete for clients. The old `Desktop App` (`crm-web`) only added
desktop-first layout + a few views + the admin console. So the merge was "make the PWA
responsive and bring over the desktop-only value," not a rewrite.

## How the merge was done (reference)
- **Responsive shell.** The fixed 448px shell was replaced with a layout that, at `lg`+, shows
  a **sidebar + wide content** (the look ported from the old `Desktop App` Sidebar), and below
  `lg` keeps the phone layout + bottom nav. One nav source of truth, filtered by the user's
  enabled surfaces + permissions (`filterNav`).
- **Reconciled routes.** Best implementation kept per concept (kanban Pipeline board at
  desktop width, the lead list for phones). `Paid Ads` and `Activity` brought over; dev-only
  `Showroom`/`Simulator` dropped.
- **Shared types folded in.** The old `Desktop App` used `@hauck/core` (`packages/core`).
  Rather than keep a separate package, `packages/core` was deleted and API types + permission
  capability keys live in `command-center/app`, one source of truth.
- **Login.** The email + password login form (plus Admin sign-in) lives in the unified app.
- **Deploy.** The unified app deploys to the `hauck-command-center` Pages project at
  `app.hauckmarketing.com` (Root directory `command-center/app`, Build command
  `pnpm run build`, Build output `dist`).
- `package.json` root scripts that referenced `--filter crm-web` were updated, and the
  `crm-web` package was removed from `pnpm-workspace.yaml`.

## Residual cleanup (outstanding)
- **Jake: delete the old `hauck-crm` Cloudflare Pages project.** It is no longer used (the
  app is `hauck-command-center`).
- **Redirect the old desktop origin.** `commandcenter.hauckmarketing.com` (and
  `dash.hauckmarketing.com`, `hauck-crm.pages.dev`) are dead. Point or redirect the old
  desktop origin to `app.hauckmarketing.com`.
- **Drop the dead CORS origins** so only `app.hauckmarketing.com` remains allowed.

## Definition of done (met)
- One codebase at `app.hauckmarketing.com` renders a wide desktop layout AND a phone PWA
  layout from the same routes, gated by surface entitlements + permissions.
- `crm-web` / `hauck-crm` retired from the codebase; only the residual Cloudflare cleanup
  above remains.

## MANUAL ACTIONS — JAKE MUST DO
1. **Cloudflare:** delete the old `hauck-crm` project and set the redirect from the old
   desktop origin to `app.hauckmarketing.com`.
2. Confirm the dead CORS origins are dropped (this Claude can do the code change).

## Manual actions ALREADY DONE FOR YOU
- The merge shipped and deployed (2026-06-19): one responsive app at `command-center/app`,
  old `Desktop App` and `packages/core` deleted, live at `app.hauckmarketing.com`.
