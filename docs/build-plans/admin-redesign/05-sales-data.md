# 05 — Sales Data (Sales)

Reuses the shared daily-funnel engine (00-foundation F3), same as Cold Call (03). Different columns. Read `_architecture.md` + `00-foundation.md` + `03-cold-call.md` (near-identical shape).

## 1. Goal / DoD
Sales pillar tab "Sales Data": editable daily sales-call funnel. One row per day, auto-populated month, live rates, Average/Total-MTD footer, stat tiles. Manual entry.

## 2. Chosen layout
Reuses the approved Cold Call layout (`cold-calling.html`) via `<DailyTracker>` with a Sales column schema. Single tab in the Sales pillar for now.

## 3. Data model
Migration `0028_sales_data.sql` (or next free). Agency-global (NO tenant_id).
Table `sales_data`:
- `id uuid pk default gen_random_uuid()`
- `day date not null unique`
- inputs: `calls_on_calendar int`, `rescheduled_cancelled int`, `calls_taken int` (showed), `qualified int`, `closed int`, `cash_collected numeric(12,2)`, `notes text`
- `updated_at timestamptz not null default now()`
Computed (NOT stored, derived in lib): Show-Up % = calls_taken / calls_on_calendar; Qualified % = qualified / calls_taken; Closing % (overall) = closed / calls_taken; Closing % (from qualified) = closed / qualified.

## 4. API
`functions/api/admin/tracker/sales-data.ts` — GET `?month=` + PATCH upsert by `day`. Same shape/guards as Cold Call; reuse `functions/lib/tracker.ts` whitelist/validate. `cash_collected` is money (numeric). `logAdminAction("tracker.sales_data.update")`.

## 5. Client
- DTO `SalesDataRow` in `src/lib/api.ts`.
- Hooks `useSalesDataQuery(month)` + `useSaveSalesDataDay()` (optimistic), keyed `["admin","tracker","sales-data",month]`.
- Component: `<DailyTracker>` with the Sales column schema + `computeRow`/`computeRollup` (rates above) + stat tiles (e.g. Calls Taken MTD, Show-Up %, Closed, Cash Collected). Mounts in the Sales PillarPage (`?tab=sales-data`, the only tab).

## 6. Tests
Add a Sales schema case to `src/lib/trackerMonth.test.ts` (the four rate formulas, safe divide on zero). Reuse `functions/lib/tracker.test.ts`.

## 7. File-by-file
1. `supabase/migrations/0028_sales_data.sql`.
2. `functions/api/admin/tracker/sales-data.ts` (reuses `functions/lib/tracker.ts`).
3. `src/lib/api.ts` — `SalesDataRow` DTO + fetchers.
4. `src/hooks/useApi.ts` — query + mutation hooks.
5. Sales PillarPage — render DailyTracker for the Sales Data tab.
(No new shared engine work; `trackerMonth.ts` + `DailyTracker.tsx` already exist from 03/F3.)

## 8. Verify
`npm run typecheck && npm test && npm run build`. `npm run db:migrate`. In-app: Sales → Sales Data, type a day, rates + footer update, persists on reload, money formats.

## 9. Out of scope / Phase 2
Auto-fill closes/cash from GHL Sales pipeline. Later.
