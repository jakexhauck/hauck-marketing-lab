# Desktop Command Center — Finish & Ship Plan

Status: active. Scope: get the web CRM ("Desktop App") fully wired to live data and
shipped to production. Native Tauri wrap and real Paid Ads data are deliberately
deferred. UI polish comes after this plumbing is proven.

Decisions driving this plan (Jake, 2026-06-16):
- **Web now, Tauri later.** Ship the browser CRM at `crm.hauckmarketing.com` first; the
  native Tauri shell (bearer + keychain) is a clearly separate later phase.
- **Paid Ads stays demo.** No Meta Marketing API work now. `adsData.ts` keeps `DEMO = true`
  and the surface stays honestly labeled.
- **Verify deploy state.** Production status (Pages project + custom domain) is unconfirmed;
  the plan checks it explicitly.

---

## Reality check: what's already done

This is further along than the original baseline plan assumes. Confirmed in-repo:

- **Backend is transport-agnostic and complete.** `mintSessionToken`, the bearer-header
  fallback in `verifySession`, the `token` field in the login response, and CORS for
  `crm.hauckmarketing.com` / `hauck-crm.pages.dev` / `localhost:5174` are all live in the
  Mobile App's `functions/`.
- **Every endpoint the CRM calls exists.** Cross-checked the 16 `/api/*` paths the Desktop
  App calls against `functions/api/` — zero missing. Reads and writes are covered.
- **Shared core + workspace exist.** Desktop App imports `@hauck/core` for the API client
  and types; pnpm workspace is set up.
- **All surfaces wired to live data** except Paid Ads: Overview, Pipeline, Inbox, Contacts,
  Calendar, Billing, Activity, Team, Login. Optimistic pipeline drag, send-message,
  notes/tasks CRUD, mark-notifications-read all present.
- **Auth is full.** Owner shared-password login AND staff email/password login with an
  effective-permissions map and a `can(capability, action)` gate that mirrors the backend.
- **It typechecks clean** (`tsc --noEmit` passes) and the Vite dev proxy points `/api` at
  the local Wrangler server on :8788.

**Conclusion:** "backend plumbing" is ~90% done. The remaining work is verification,
the production deploy, and documenting two deliberate deferrals.

---

## Phase A — Verify end-to-end locally (close any real gaps)

Goal: prove every surface works against live GHL/Supabase data before shipping. This is
where any genuine plumbing gap will surface.

1. **Start the backend** (Mobile App, Wrangler on :8788, loads `.dev.vars`).
2. **Start the CRM** (`pnpm --filter crm-web dev`, :5174, proxies `/api` → :8788).
3. **Build check:** `pnpm --filter crm-web build` must pass (tsc + vite), not just typecheck.
4. **Owner login** (shared password) → lands authenticated, every surface visible.
5. **Walk every surface with live data:**
   - Overview: stat strip, pipeline ribbon, needs-attention, activity feed, upcoming appts.
   - Pipeline: board loads real leads; drag a card → stage persists (optimistic + refetch).
   - Inbox: conversations list + thread; send a test message → appears.
   - Contacts: table loads; open drawer; add a note; add/toggle/delete a task.
   - Calendar: agenda renders real events.
   - Billing: invoices + transactions load; open an invoice detail.
   - Activity: timeline groups by day.
   - Paid Ads: renders demo dataset with the demo banner showing (expected).
6. **Staff login + permission gating:** sign in as a staff account; confirm surfaces/edit
   controls hide per the grant map; confirm the server rejects an ungranted write (defense
   in depth, not just UI hiding).
7. **Session edges:** expired/401 bounces to `/login` via the `hml:unauthorized` event;
   sign-out clears the query cache.

Fix anything that breaks here. Expectation based on the audit: little to none.

---

## Phase B — Ship to production

The single coordination point. The deploy ships whatever is on `main`.

1. **Confirm the backend deploy is live.** curl prod login; the response must include a
   `token` field (proves the transport-agnostic auth is deployed, not just in the tree):
   ```
   curl -s -X POST https://dash.hauckmarketing.com/api/auth/login \
     -H 'content-type: application/json' -d '{"password":"<APP_PASSWORD>"}'
   ```
   If `token` is missing, the Mobile App backend changes haven't been pushed/deployed yet —
   do that first (push `main`, watch the `hauck-dashboard` Pages build go green).
2. **Commit the Desktop App working tree.** ~86 files are staged/modified (the reorg under
   "Hauck Command Center (Clients)/" plus recent edits to App/useApi/Team/Login/nav).
   Commit them on `main`.
3. **Create / confirm the `hauck-crm` Pages project** (Manual-Actions Part C):
   - Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter crm-web build`
   - Output dir: `crm-web/dist` (note: path may need updating to the new
     "Hauck Command Center (Clients)/Desktop App/dist" — verify the build command/output
     against the post-reorg paths before the first build).
   - Env (Production): `NODE_VERSION=20`, `PNPM_VERSION=10`,
     `VITE_API_BASE=https://dash.hauckmarketing.com`. No secrets.
4. **Push `main`** → Pages builds. Verify `https://hauck-crm.pages.dev` shows the login.
5. **Custom domain** `crm.hauckmarketing.com` (Manual-Actions Part D): CNAME at Namecheap,
   wait for Active in Cloudflare. Already in the backend CORS allowlist, so no code change.
6. **Prod smoke test:** owner login on the real domain, one surface loads live data, one
   write round-trips. Sanity-check the mobile app still logs in (the backend change was
   additive, so this should be uneventful).

> Watch-item: the build paths in Manual-Actions still reference `crm-web/`. After the reorg
> the app lives in "Hauck Command Center (Clients)/Desktop App/". Reconcile the Pages build
> command + output dir with the actual path (and the pnpm filter name, still `crm-web` per
> `package.json`) before the first production build.

---

## Phase C — Deliberate deferrals (documented, not built now)

- **Paid Ads → real data.** Keep `adsData.ts` (`DEMO = true`). When wired, replace
  `buildAdsDataset` with a fetch behind the same exported types. Options for later: Meta
  Marketing API integration in `functions/`, or a manual-entry Supabase table. Out of scope.
- **Native Tauri desktop wrap.** A new, separate Tauri 2 project that bundles the built CRM
  and authenticates via bearer token in the OS keychain (the backend already returns `token`
  and accepts the bearer header, so this is a thin layer, not a rebuild). Out of scope now.
- **Realtime sync.** Polling already syncs all apps via the shared backend. A Supabase
  Realtime subscription on `activity_log` is an optional later upgrade.

---

## Phase D — After plumbing: the UI pass (placeholder)

Once the above is live and proven, the larger UI work begins (dense desktop layouts, bulk
actions, reporting, keyboard shortcuts, command palette depth). Tracked separately. Use the
`frontend-design` skill for that pass.

---

## Open items needing Jake

- **Deploy state:** confirm whether `hauck-crm` Pages + `crm.hauckmarketing.com` already
  exist (Phase B steps 3/5 are no-ops if so).
- **Backend deploy:** confirm prod login already returns `token` (Phase B step 1).
- Everything else above I can do.
