# 03 — Cold Call (Acquisition)

Reference impl already built and approved: `command-center/docs/mockups/admin-redesign/cold-calling.html`. This surface IS the reference for the shared daily-funnel engine (00-foundation F3). Read `_architecture.md` + `00-foundation.md`.

## 1. Goal / DoD
Acquisition pillar tab "Cold Call": an editable daily dialing funnel. One row per day, auto-populated for the viewed month, month nav + Today, live-computed rates, Average/Total-MTD footer, stat tiles. Manual entry; app DB is source of truth.

## 2. Chosen layout
`cold-calling.html` (Bento Bold, editable). Structure: header + Acquisition tab bar (Leads · Cold Call · SMS), month nav, 4 stat tiles (Calls Made, Pickup %, Meetings Booked, Booking %), full-width editable table, sticky footer. This is the canonical `DailyTracker` usage.

## 3. Data model
Migration `0027_cold_calls.sql` (or next free). Agency-global (NO tenant_id).
Table `cold_calls`:
- `id uuid pk default gen_random_uuid()`
- `day date not null unique`
- inputs: `calls_made int`, `pickups int`, `pass_through int`, `meetings_booked int`, `objections text`, `notes text`
- `updated_at timestamptz not null default now()`
Computed columns (pickup %, pickup→PT %, pitch→book %) are NOT stored; derived in the shared lib.

## 4. API
`functions/api/admin/tracker/cold-calls.ts`, admin-gated, service client.
- `onRequestGet` — `?month=YYYY-MM` → returns rows in range `[first, last]` of that month: `{ days: ColdCallRow[] }`.
- `onRequestPatch` — body `{ day: "YYYY-MM-DD", field, value }` (or a full row) → upsert on `day` (`onConflict:"day"`), whitelist input fields, `logAdminAction(client, admin.id, "tracker.cold_call.update", null, {day})`. Return `{ ok:true }`.
- Validate: `day` is ISO date; numeric fields coerce to non-negative int or null.

## 5. Client
- DTO `ColdCallRow` in `src/lib/api.ts`.
- Hooks in `useApi.ts`: `useColdCallsQuery(month)` keyed `["admin","tracker","cold-calls",month]`; `useSaveColdCallDay()` mutation with optimistic update (snapshot the month's rows, patch the one day, rollback on error, invalidate on settle).
- Component: mount `<DailyTracker>` (00-foundation F3) with the Cold Call column schema + `computeRow`/`computeRollup` from `src/lib/trackerMonth.ts` + Cold-Call-specific stat tiles. Lives in the Acquisition PillarPage under `?tab=cold-call`.

## 6. Tests
`src/lib/trackerMonth.test.ts` covers month generation, weekend/today flags, `pct` safe-divide, rollups. Add a Cold-Call schema case (pickup% = pickups/calls etc.). Endpoint upsert logic: extract the whitelist/validate into `functions/lib/tracker.ts` + `tracker.test.ts`.

## 7. File-by-file
1. `supabase/migrations/0027_cold_calls.sql` — table.
2. `functions/lib/tracker.ts` (+ test) — shared upsert/validate helper for tracker tables.
3. `functions/api/admin/tracker/cold-calls.ts` — GET/PATCH.
4. `src/lib/trackerMonth.ts` (+ test) — shared month/rate engine (from 00-foundation F3; created here if not already).
5. `src/components/admin/tracker/DailyTracker.tsx` — shared table component (from F3).
6. `src/lib/api.ts` — `ColdCallRow` DTO + fetchers.
7. `src/hooks/useApi.ts` — query + mutation hooks.
8. Acquisition PillarPage — render DailyTracker for the Cold Call tab.

## 8. Verify
`npm run typecheck && npm test && npm run build`. `npm run db:migrate`. In-app: open Acquisition → Cold Call, type into a day, watch rates + footer + tiles update, reload → value persisted, switch months.

## 9. Out of scope / Phase 2
Auto-fill dial counts from a dialer/GHL. Not now.
