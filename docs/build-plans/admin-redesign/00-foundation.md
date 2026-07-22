# 00 — Foundation: shell rebuild + shared engines

Everything else depends on this. Build it first. Read `_architecture.md` alongside.

## Goal / definition of done
- Old admin (Theory-of-Constraints pillar pages, plus SOPs / Onboarding / Build / Infra / Messages / Hero / Plans / Assets / old Clients-Lane) is removed.
- Fulfillment cockpit is KEPT untouched (Billing + Ad Tracking tabs added by their own plans).
- New pillar-page framework in place: each pillar renders a header + a per-pillar TAB BAR (Bento Bold), one tab per surface, driven by `?tab=`.
- Shared **daily-funnel tracker engine** exists and is unit-tested (Cold Call, Cold SMS daily, Sales Data, and the day-grid of Ad Tracking all build on it).
- App typechecks, builds, tests green. Nothing fabricates data; empty months show the auto-generated empty template.

## Scope decisions (locked with Jake)
- Phase 1 = manual entry, app DB = source of truth. Phase 2 (auto-fill from GHL/Meta) is OUT of scope here.
- Design = Bento Bold, ported from the approved mockups. Keep the `.pk-kit` theme wrapper.
- Agency-internal surfaces are NOT tenant-scoped; Billing + Ad Tracking ARE (see `_architecture.md`).

## Work

### F1. Remove the old admin surfaces
- Delete routes + components no longer used: `AdminPillarPage.tsx` (replaced), the TOC constraint UI (`ConstraintPanel`, constraint editors), `AdminSops*`, `AdminOnboarding*`, `AdminBuild`, `BuildBoard`, `AdminInfrastructure`, `AdminMessages`, `AdminHero`, `Plans`, `Assets`, `AdminTasks` (folds into the new Tasks surface), `AdminClients`/`AdminLane` if superseded. Remove their `<Route>`s from `App.tsx` and their `SPINE_NAV`/links.
- Keep: `AdminLayout`, `AdminCommand` (rebuilt by Business Health plan), `AdminDelivery` + `DeliveryCockpit` + cockpit components, `AdminSettings`, auth.
- Leave `pillar_constraints` table in place (unused) or drop in a later migration; do not block on it.
- Verify the app still boots with only the kept routes before moving on.

### F2. Pillar-page framework (`PillarPage` shell + tab bar)
- New `src/routes/admin/PillarPage.tsx` (or per-pillar pages) rendering: Bento Bold header (kicker + title + tagline) and a `pk-tabs` tab bar. Tab config per pillar (id, label, route/param). Active tab via `?tab=` (mirror `DeliveryCockpit`'s `useSearchParams` approach).
- Pillars + their tabs:
  - Acquisition `/admin/pillar/acquisition`: Leads · Cold Call · SMS
  - Sales `/admin/pillar/sales`: Sales Data (single tab for now)
  - Operations `/admin/pillar/operations`: Calculator · Time Audit · Tasks
  - Command `/admin` = Business Health (no tab bar; its own page)
- Update `SPINE_NAV` labels/routes if needed (spine stays Command · Acquisition · Sales · Fulfillment · Operations · Settings).
- Extract tab config to a pure `src/lib/adminPillars.ts` and unit-test resolution (valid/invalid `?tab=` → default), mirroring `deliveryCockpit.ts`.

### F3. Shared daily-funnel tracker engine
The reusable core behind Cold Call (done as mockup), Cold SMS daily, Sales Data, and Ad Tracking's day grid.
- **Pure lib** `src/lib/trackerMonth.ts` (unit-tested): generate every day of a given month; weekend flag; today flag; per-row computed-rate helpers (`pct`, safe divide, format); month rollups (Average/day, Total MTD). No React.
- **Component** `src/components/admin/tracker/DailyTracker.tsx`: renders the Bento Bold table from a column schema (input cols vs computed cols), editable `<input>` cells, sticky Average/Total footer, month nav (prev/next + Today), auto-populated day rows, stat-tile row. Props: `columns`, `computeRow`, `computeRollup`, `data`, `onEdit(day, field, value)`, `statTiles`. Port markup/CSS from `cold-calling.html`.
- **Persistence contract**: one row per day per tracker. Editing a cell PATCHes that day's row (upsert by date). Month view = GET rows for `year-month`.
- Each daily surface (Cold Call, SMS daily, Sales Data) supplies its own column schema + endpoint; the engine + table are shared.

### F4. Data-layer conventions (used by every surface plan)
- Migration per surface (`0027…`), tables per `_architecture.md` scoping.
- Endpoint per surface (`functions/api/admin/tracker/<x>.ts` agency-global, or `.../clients/[tenantId]/<x>.ts` per-client): GET (list/by-month) + POST/PATCH upsert, admin-gated, `logAdminAction` on writes, service client.
- Query + mutation hooks in `useApi.ts` keyed `["admin","tracker","<x>", …]`; optimistic row edits (snapshot/rollback) for the tracker tables.
- Typed DTOs in `src/lib/api.ts`.

## Verify
- `npm run typecheck`, `npm run build`, `npm test` green.
- Boot the app: each pillar renders its tab bar; tabs switch via `?tab=`; a placeholder tab body is fine until its surface plan lands.
- `npm run db:migrate` applies cleanly (once the first surface migration exists).

---

## Plan template (every surface plan follows this)
1. **Goal / DoD** (what the finished page does, phase-1 manual).
2. **Chosen layout** — reference the picked mockup file; note the key layout structure.
3. **Data model** — migration NNNN, table name, columns, scoping (agency vs tenant), enums.
4. **API** — endpoint path(s), methods, request/response DTOs, validation, audit.
5. **Client** — DTOs in `api.ts`, hooks in `useApi.ts`, the React component(s) + where it mounts (pillar tab or cockpit tab), reuse of `DailyTracker`/engine where applicable.
6. **Tests** — pure-lib unit tests (rate math, rollups, month gen, computed fields).
7. **File-by-file change list** (ordered).
8. **Verify** — typecheck/build/test + manual check in the running app.
9. **Out of scope / Phase 2** — the GHL/Meta auto-fill hooks this surface will later use.
