# 08 — Scaling Calculator (Operations pillar · "Calculator" tab)

Depends on `00-foundation.md` (PillarPage shell + Operations tab bar) and follows `_architecture.md`. Phase 1 = manual entry only; the compute is 100% client-side and live.

---

## 1. Goal / DoD

A single agency-internal calculator that turns seven inputs into one protected daily target.

- Operations pillar page, tab **Calculator** (`/admin/pillar/operations?tab=calculator`, the default tab).
- Layout C: one compact inputs bento card (7 fields in a grid) above a colorful result-tile row, with **Total Daily Input Needed** as the oversized gradient hero tile in the last column.
- Editing any input recomputes all five outputs **live, client-side** (no round-trip, no save button needed to see results).
- The seven inputs persist agency-globally: they are loaded on mount and saved (debounced) so the page remembers Jake's last numbers across sessions/devices. Persistence is a convenience only; it never gates the compute.
- The math lives in a pure, thoroughly unit-tested `src/lib/scalingCalculator.ts`. Verified against the source sheet: goal $10,000, offer $1,000, closing 20%, show 60%, booking 2%, revenue $0, avg cash/close $1,000 → **10 clients, 50 shows, 83 calls, ~4,167 monthly, ~139 daily**.
- `npm run typecheck`, `npm run build`, `npm test` green; migration applies via `npm run db:migrate`.

**Not** in phase 1: any auto-fill of inputs from GHL/Meta/Sales Data, multi-scenario saving, per-client scoping, history.

---

## 2. Chosen layout

Port `command-center/docs/mockups/admin-redesign/scaling-calculator-C.html` into React under the `.pk-kit` admin theme.

Structure (top to bottom, inside the tab body):
- **Compact inputs card** (`.compact`): header row (indigo icon + "Your Numbers" title/subtitle + amber pill note "Heavily underestimate your KPIs so it becomes impossible not to hit target"), then a `.cc-grid` of 7 `.cell` fields. Money fields carry a leading `$` affix, percent fields a trailing `%` affix (`.fwrap.money` / `.fwrap.pct`). Fields, in order: Current Revenue, Monthly Cash Goal, Offer Price, Avg Cash / Close, Closing %, Show Rate %, Booking Rate %.
- **Results row** (`.rrow`, `grid-template-columns: repeat(4,1fr) 1.5fr`): four pastel stat tiles (indigo · sky · amber · green) each with icon, label, big value, and a formula sub-caption + a chevron `.arrow` between them, then the **hero** gradient tile (`Total Daily Input Needed`).
  - Tile 1 indigo — New Clients Needed — `goal ÷ avg cash / close`
  - Tile 2 sky — Calls / Shows Needed — `clients ÷ closing %`
  - Tile 3 amber — Total Calls Needed — `shows ÷ show rate %`
  - Tile 4 green — Total Monthly Input — `calls ÷ booking rate %`
  - Hero — Total Daily Input Needed — `monthly input ÷ 30 days`
- Responsive breakpoints from the mockup: `.rrow` collapses to 2-up then 1-up, `.cc-grid` 7→4→2, hero spans full width, arrows hide.

Keep the CSS tokens from the mockup (indigo/green/sky/amber tints, `--radius:22px`, Poppins display + Inter body, tabular-nums). Drop the standalone `.spine`/`.tabs`/`.kicker`/`h1.title` chrome — those come from the shared `PillarPage` shell built in foundation; this component renders only the stage contents (`.compact` + `.rrow`). Remove the mockup's "Sample data for design review" footnote.

**Faithful-to-mockup note (important):** the approved compute uses **Avg Cash / Close** (not Offer Price) as the divisor for New Clients Needed. Offer Price is captured and persisted but is not part of the current derivation. Implement the math exactly as the mockup does; keep Offer Price as a stored field for reference/future use.

---

## 3. Data model

Migration `command-center/app/supabase/migrations/0027_scaling_calculator.sql` (latest applied is 0026; this is the next).

Agency-internal, **no `tenant_id`** (per `_architecture.md` scoping). Single-row settings table — the calculator only ever remembers one set of inputs.

```sql
create table if not exists public.scaling_calculator (
  id             int primary key default 1,
  current_revenue   numeric not null default 0,
  monthly_cash_goal numeric not null default 10000,
  offer_price       numeric not null default 1000,
  avg_cash_close    numeric not null default 1000,
  closing_pct       numeric not null default 20,
  show_rate_pct     numeric not null default 60,
  booking_rate_pct  numeric not null default 2,
  updated_at        timestamptz not null default now(),
  constraint scaling_calculator_singleton check (id = 1)
);

insert into public.scaling_calculator (id) values (1)
  on conflict (id) do nothing;
```

Notes:
- `id` fixed to `1` via the CHECK + seeded row → guaranteed single row; the endpoint upserts on `id=1`.
- Percentages stored as whole numbers (20 = 20%), matching the input fields; the pure lib divides by 100.
- No RLS needed — backend uses the service-role client behind admin middleware.

---

## 4. API

Endpoint: `command-center/app/functions/api/admin/tracker/scaling-calculator.ts` (agency-global tracker path). Admin-gated by `functions/api/_middleware.ts` (`/api/admin/*`). Start each handler with `getServiceClient(ctx.env)` → 503 if null.

**GET `/api/admin/tracker/scaling-calculator`** → the singleton row as a camelCase DTO. If the row is somehow missing (migration ran but seed skipped), return the defaults object rather than 404 so the page always has numbers.

**PATCH `/api/admin/tracker/scaling-calculator`** → whitelist the seven numeric fields from the body, coerce to finite numbers (ignore non-numeric/undefined keys), upsert onto `id=1` with `updated_at = now()`, return the updated DTO. Call `logAdminAction(client, ctx.data.admin.id, "scaling_calculator.update", null, body)` on success (`targetTenantId` = null since agency-global; signature in `functions/lib/adminAuth.ts:74`).

Whitelist map (body camelCase → column snake_case): `currentRevenue→current_revenue`, `monthlyCashGoal→monthly_cash_goal`, `offerPrice→offer_price`, `avgCashClose→avg_cash_close`, `closingPct→closing_pct`, `showRatePct→show_rate_pct`, `bookingRatePct→booking_rate_pct`. Reject NaN/Infinity per field (skip, don't 400 the whole request) so a mid-typing partial save is safe.

Reference shape to copy: `functions/api/admin/overview.ts` (503 guard + service client) and the PATCH whitelist + audit pattern in `functions/api/admin/clients/[tenantId].ts`.

Response DTO (`ScalingCalculatorInputs`):
```jsonc
{ "currentRevenue": 0, "monthlyCashGoal": 10000, "offerPrice": 1000,
  "avgCashClose": 1000, "closingPct": 20, "showRatePct": 60, "bookingRatePct": 2 }
```

---

## 5. Client

### 5a. Pure lib — `src/lib/scalingCalculator.ts`
The whole point of the surface. No React, no formatting side effects.

```ts
export interface ScalingInputs {
  currentRevenue: number;   monthlyCashGoal: number;  offerPrice: number;
  avgCashClose: number;     closingPct: number;       showRatePct: number;
  bookingRatePct: number;
}
export interface ScalingOutputs {
  gap: number;              // max(goal - revenue, 0)
  newClientsNeeded: number; // gap / avgCashClose
  callsShowsNeeded: number; // clients / (closingPct/100)
  totalCallsNeeded: number; // shows / (showRatePct/100)
  totalMonthlyInput: number;// calls / (bookingRatePct/100)
  totalDailyInput: number;  // monthly / 30
}
export const DEFAULT_INPUTS: ScalingInputs;   // matches migration defaults
export const DAYS_PER_MONTH = 30;
export function computeScaling(i: ScalingInputs): ScalingOutputs;
export function formatScaling(v: number): string; // Math.round + en-US grouping
```

Rules (mirror the mockup's `compute()` exactly):
- `gap = Math.max(goal - revenue, 0)`.
- Every division guards its denominator: `> 0 ? a / b : 0` (avg, closing, show, booking). Prevents `Infinity`/`NaN` when a field is 0 or blank.
- **Keep raw (unrounded) intermediate values through the whole chain; round only at display via `formatScaling`.** Rounding intermediates would drift the daily number (e.g. rounding calls 83.33→83 first yields 138, not the correct 139). Outputs return raw floats; the component formats each with `formatScaling`.
- `formatScaling(v) = Math.round(v).toLocaleString("en-US")` → "4,167", "139".

### 5b. DTO — `src/lib/api.ts`
Add `export interface ScalingCalculatorInputs { … 7 fields … }` and two thin fetchers: `getScalingCalculator(): Promise<ScalingCalculatorInputs>` (GET) and `saveScalingCalculator(body: ScalingCalculatorInputs): Promise<ScalingCalculatorInputs>` (PATCH), both via `api<T>(...)`.

### 5c. Hooks — `src/hooks/useApi.ts`
- `useScalingCalculatorQuery(enabled)` → `useQuery({ queryKey: ["admin","tracker","scaling-calculator"], enabled, staleTime: 60_000, queryFn: getScalingCalculator })` (copy `useAdminOverviewQuery` at line 330).
- `useSaveScalingCalculatorMutation()` → `useMutation({ mutationFn: saveScalingCalculator, onSuccess: () => qc.invalidateQueries({ queryKey: ["admin","tracker","scaling-calculator"] }) })`.

### 5d. Component — `src/components/admin/operations/ScalingCalculatorTab.tsx`
- Fetch inputs via the query; seed local `useState<ScalingInputs>` from the response (fall back to `DEFAULT_INPUTS` while loading so tiles render immediately, never blank).
- Controlled `<input inputmode="decimal">` per field; local state updates on every keystroke → `computeScaling(state)` recomputes synchronously → tiles rerender live. Parse input strings with the mockup's tolerant parser (`parseFloat(String(v).replace(/,/g,""))`, `NaN`→0).
- **Persistence:** debounce (~600ms after last edit) a `saveScalingCalculator` mutation with the current state. No visible save button (matches the mockup's zero-chrome feel); optional tiny "Saved" affordance is fine but not required. Loading a stale/absent row still shows defaults.
- Render the ported markup: `.compact` inputs card + `.rrow` results (four `.stat` tiles + `.hero`), each value from `formatScaling(outputs.*)`. Formula sub-captions and icons per the mockup.
- Mount point: add a `calculator` case to the Operations `PillarPage` tab switch (built in foundation `F2`; tabs = Calculator · Time Audit · Tasks, Calculator is the default). If foundation is not yet merged, the component is still self-contained and can be wired when the Operations tab bar lands.

Scope CSS: port the mockup's calculator-specific rules into a co-located CSS module or a `.pk-` prefixed block under the admin theme so `.stat`, `.hero`, `.cc-grid`, `.fwrap` don't collide with other surfaces.

---

## 6. Tests

`src/lib/scalingCalculator.test.ts` (Vitest, Node env, co-located — mirrors `src/lib/adminCommand.test.ts`):

1. **Sheet baseline** — `computeScaling(DEFAULT_INPUTS)` (goal 10000, rev 0, avg 1000, closing 20, show 60, booking 2): `newClientsNeeded === 10`, `callsShowsNeeded === 50`, `totalCallsNeeded` ≈ 83.33, `totalMonthlyInput` ≈ 4166.67, `totalDailyInput` ≈ 138.89. And the **formatted** values: `"10"`, `"50"`, `"83"`, `"4,167"`, `"139"`.
2. **No premature rounding** — assert daily formats to `"139"` not `"138"`, proving intermediates stayed raw.
3. **Revenue reduces the gap** — rev 4000, goal 10000 → gap 6000 → clients 6 → daily ≈ 83.
4. **Zero-denominator guards** — closing 0 / show 0 / booking 0 / avg 0 each yield `0` (no `Infinity`/`NaN`) for the dependent outputs.
5. **Goal below revenue** — rev 20000, goal 10000 → gap 0 → all outputs 0.
6. **`formatScaling`** — rounding + thousands grouping (4166.67→"4,167", 138.4→"138", 138.5→"139", 0→"0").

No endpoint integration test in phase 1 (persistence is best-effort convenience); the pure lib carries the correctness weight.

---

## 7. File-by-file change list (ordered)

1. `command-center/app/supabase/migrations/0027_scaling_calculator.sql` — new singleton table + seed row.
2. `command-center/app/src/lib/scalingCalculator.ts` — pure compute + format + defaults (write test first, TDD).
3. `command-center/app/src/lib/scalingCalculator.test.ts` — unit tests from §6.
4. `command-center/app/functions/api/admin/tracker/scaling-calculator.ts` — GET + PATCH (whitelist, coerce, upsert id=1, audit).
5. `command-center/app/src/lib/api.ts` — `ScalingCalculatorInputs` DTO + `getScalingCalculator` / `saveScalingCalculator`.
6. `command-center/app/src/hooks/useApi.ts` — `useScalingCalculatorQuery` + `useSaveScalingCalculatorMutation`.
7. `command-center/app/src/components/admin/operations/ScalingCalculatorTab.tsx` — ported Layout C component (+ scoped CSS).
8. Operations `PillarPage` (from foundation, e.g. `src/routes/admin/PillarPage.tsx` or `operations` pillar file) — add the `calculator` tab branch mounting `ScalingCalculatorTab`, set as default tab.

---

## 8. Verify

- `npm test` — new `scalingCalculator.test.ts` green, whole suite green.
- `npm run typecheck` (app + functions) and `npm run build` clean.
- `npm run db:migrate` applies 0027 idempotently; confirm a single seeded row (`select * from public.scaling_calculator`).
- Boot the app, sign in as admin, open `/admin/pillar/operations?tab=calculator`:
  - Default numbers show clients 10 / shows 50 / calls 83 / monthly 4,167 / daily 139.
  - Edit Monthly Cash Goal to 20000 → outputs double live with no reload (daily → 278).
  - Set Current Revenue to 20000 while goal is 20000 → all outputs go to 0 (gap closed).
  - Reload the page → last-entered numbers persist (GET returns them).
  - Layout matches mockup C at desktop and collapses correctly narrow (tiles 4→2→1, hero full-width).

---

## 9. Out of scope / Phase 2

- **Auto-fill inputs from live data:** Current Revenue and Avg Cash/Close from the Sales Data tracker / GHL revenue join; Closing/Show/Booking rates derived from the Cold Call + Sales Data funnel actuals instead of hand-entered estimates.
- Per-scenario saves (name + compare multiple targets), history/trend of the daily number over time.
- Wiring the daily target into the Command home / Business Health as a "today's required output" KPI.
- Offer Price entering the formula (currently stored-only; revisit if the model changes from Avg Cash/Close to price × units).
