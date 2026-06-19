# Plan 04 — Unify into ONE responsive Command Center (MERGE track)

**You are one of several Claude instances. Read `00-INDEX.md` first.** Address Jake as
**"Sir"**. **No em dashes.** **Ask clarifying questions** before reshaping any UI.

**Depends on:** Willis being live (Plans 01-03). This is the "make it one app" phase.

## Goal

Collapse the two builds into **one responsive codebase** served at `app.hauckmarketing.com`:
one app that lays out wide on desktop (sidebar + multi-column) and installs as a PWA on
phones (bottom nav), same login, same data, same backend. Then retire the Desktop App
(`crm-web`). The admin view comes in Plan 05.

## Why the Mobile App is the base
The Mobile App (`client-dashboard`) owns the backend (`functions/`), the PWA/offline infra,
and is feature-complete for clients. The Desktop App (`crm-web`) only adds desktop-first
layout + a few views + the admin console. So the merge is "make the PWA responsive and bring
over the desktop-only value," not a rewrite.

## START HERE: ask Jake
- "On desktop, do you want a left **sidebar** nav (recommended) matching the current desktop
  build's shell, with the phone keeping the bottom tab bar?"
- "Which desktop-only views matter: **Paid Ads**, **Activity**, the kanban **Pipeline board**?
  Map them onto the mobile equivalents or bring them over?"
- "Any view you want to drop (the mobile build has dev-only `Showroom` and `Simulator`)?"

## Current state (audited)
- Mobile shell is **phone-only**: `Mobile App/src/components/Shell.tsx` hard-caps width to
  448px; `BottomNav.tsx` is a fixed 4-item bar; routes in `src/App.tsx`.
- Desktop shell: `Desktop App/src/components/shell/Sidebar.tsx`, nav in `src/lib/nav.ts`,
  richer routes (`Overview`, `PaidAds`, `Pipeline` kanban, `Inbox`, `Activity`).
- Route concept overlap: Leads≈Pipeline, Conversations≈Inbox, Dashboard/Home/Today≈Overview.

## Work
1. **Responsive shell.** Replace the fixed 448px shell with a layout that, at `lg`+, shows a
   **sidebar + wide content** (port the look from `Desktop App` Sidebar), and below `lg` keeps
   the current phone layout + bottom nav. One nav source of truth, filtered by the user's
   enabled surfaces + permissions (mirror `Desktop App/src/lib/nav.ts` `filterNav`).
2. **Reconcile routes.** Pick the best implementation per concept (e.g. keep the kanban
   Pipeline board for desktop width, the mobile lead list for phones, or make one component
   responsive). Bring over `Paid Ads` and `Activity` if Jake wants them. Delete dev-only
   `Showroom`/`Simulator` unless Jake keeps them.
3. **Shared types.** The Desktop App used `@hauck/core`; the Mobile App has its own copies.
   Consolidate to ONE source of truth for API types + permission capability keys so they can
   never drift. Decide: keep `packages/core` and have the merged app depend on it, or fold
   core into the app. Confirm with Jake.
4. **Login.** Carry over the email + password login form from Plan 03 into the unified app.
5. **Deploy.** The unified app deploys to the existing `hauck-command-center` project at
   `app.hauckmarketing.com`. Update the build/output config accordingly.

## Retire `crm-web`
- Once the unified app covers the desktop experience and is verified, point the old desktop
  origin (e.g. `commandcenter.hauckmarketing.com`) to redirect to `app.hauckmarketing.com`,
  remove the `crm-web` package from `pnpm-workspace.yaml`, delete the `Desktop App/` folder,
  and remove the now-defunct Cloudflare `hauck-crm` project. At this point the `crm-web` /
  `hauck-crm` names disappear (the rebrand is complete).
- Update `package.json` root scripts that referenced `--filter crm-web`.

## Definition of done
- One codebase at `app.hauckmarketing.com` renders a wide desktop layout AND a phone PWA
  layout from the same routes, gated by surface entitlements + permissions.
- Willis owner + rep verified on both form factors against the unified app (re-run the
  relevant rows of Plan 03's matrix).
- `crm-web` / `hauck-crm` retired; no references remain.

## MANUAL ACTIONS — JAKE MUST DO
1. Answer the layout/views questions in "START HERE".
2. **Cloudflare:** delete the old `hauck-crm` project and set the redirect from the old
   desktop origin to `app.hauckmarketing.com` (this Claude will tell you exactly when).
3. Re-test on your phone + desktop after the cutover and sign off.

## Manual actions ALREADY DONE FOR YOU
- Branding already says "Command Center"; backend + account login are shared, so the merge is
  a frontend consolidation, not a backend change.
