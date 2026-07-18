# 01 — Business Health (the Command home)

Rebuilds `src/routes/admin/AdminCommand.tsx` (`/admin`) from the old Theory-of-Constraints
command view into the **Business Health** dashboard: layout B, two zoned bento panels
("Money" and "Clients & Retention"), agency-global manual metrics with live-computed unit
economics and benchmark chips.

Depends on Foundation (`00-foundation.md`): the old admin surfaces are removed and `AdminCommand`
is the surface this plan fills. Read `_architecture.md` alongside.

Reference mockup (implement THIS): `command-center/docs/mockups/admin-redesign/business-health-B.html`.

---

## 1. Goal / definition of done

- `/admin` renders Business Health, not the old constraint banner / flow strip / constraints board.
- A period toggle (This month / Quarter / Year) sits under the header. Switching it loads/saves a
  **separate row per period key**.
- **Money panel** shows: CAC, Avg LTV, LTV:CAC, ROAS (all computed, "Auto" badge) plus the manual
  inputs New MRR, Profit Margin, Marketing Spend, New Revenue.
- **Clients & Retention panel** shows: Total Clients (computed end count) with a Start / New /
  Churned / End breakdown, Churn %, Avg Retention, Avg Revenue / Client.
- Typing into any tinted input recomputes the Auto tiles and benchmark chips live (client-side),
  exactly like the mockup script.
- Edits persist: each input autosaves to the current period's row (upsert). Reload restores them.
- Data is **agency-global** (NO `tenant_id`). Phase 1 = manual entry, app DB is the source of truth.
- Empty period (never saved) shows an all-zero template, not fabricated numbers.
- `npm run typecheck`, `npm run build`, `npm test` green; `npm run db:migrate` applies clean.

Phase-1 note: every value is hand-entered. The "Auto" badge means **computed from other inputs**,
not auto-filled from GHL/Meta. Auto-fill is Phase 2 (section 9).

---

## 2. Chosen layout

`business-health-B.html`. Structure to port into React under the `.pk-kit` admin theme
(mounted once by `AdminLayout` via `PillarStyle`; `AdminCommand` renders only content):

- Header: kicker "Command", `h1` "Business Health", tagline. (Existing `pk-kicker` / `pk-title` /
  `pk-tagline` classes already cover this; keep them.)
- `.controls` row with the period `.tabs` segmented control (This month / Quarter / Year), pushed
  right via `margin-left:auto`.
- `.zones`: a 2-column grid (`1.15fr 1fr`, collapses to 1 col under 1080px) holding two `.panel`
  cards:
  - `.panel.money` — head icon + "Money" / "Unit economics and revenue efficiency", then a
    `.pgrid` (2-col) of 8 `.stat` tiles.
  - `.panel.clients` — head + "Clients & Retention" / "Roster movement and staying power", then a
    `.pgrid` of tiles, two of them `.span2` (Total Clients with breakdown, Avg Revenue / Client).
- `.stat` tile anatomy: color class (`indigo|green|sky|amber|rose`) → tinted bg, icon chip, label,
  `.val` (either a read-only `data-out` computed value or an editable `.vin` / `.mini` input),
  sub-caption, optional `.chip` benchmark, optional `.auto` corner badge.

Port the mockup CSS into a scoped `<style>` block (mirror `AdminSpineStyle` in `AdminLayout.tsx`),
prefixed `.pk-kit .bh-*`. **Swap raw hex for the Modern Motion tokens where a token exists**
(`var(--surface)`, `var(--brand-tint)`, `var(--text-muted)`, `var(--text-faint)`, `var(--border)`,
`var(--radius-lg)`, `var(--font-display)`), keeping the five tinted stat palettes
(indigo/green/sky/amber/rose) as explicit values so the bento stays colorful in light and dark.
No em dashes in any copy.

---

## 3. Data model

New migration **`command-center/app/supabase/migrations/0027_business_health.sql`**.

> Sequence note: latest applied in this repo is `0026`; `_architecture.md` sets the next new number
> to `0027`. If a higher-numbered migration already exists on the branch you build from, bump to the
> next free number and keep the same shape.

Table: **`public.business_health`** — agency-global, one row per period key. No `tenant_id`.

```sql
create table if not exists public.business_health (
  id                       uuid primary key default gen_random_uuid(),
  -- Period identity. period_key is unique so a period upserts one row:
  --   month   -> "2026-07"
  --   quarter -> "2026-Q3"
  --   year    -> "2026"
  period_key               text not null unique,
  period_type             text not null,
  -- Manual inputs (Phase 1 hand entry). numeric so percents/decimals are exact.
  marketing_spend          numeric not null default 0,   -- feeds CAC and ROAS
  new_revenue              numeric not null default 0,   -- first-order revenue
  new_mrr                  numeric not null default 0,   -- recurring added
  start_clients            integer not null default 0,   -- active at period start
  new_clients              integer not null default 0,   -- signed this period
  churned_clients          integer not null default 0,   -- lost this period
  profit_margin_pct        numeric not null default 0,   -- after delivery cost, 0-100
  avg_retention_months     numeric not null default 0,   -- how long clients stay
  avg_revenue_per_client   numeric not null default 0,   -- avg monthly billing
  churn_pct                numeric not null default 0,   -- monthly logo churn, 0-100
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint business_health_period_type_check
    check (period_type in ('month','quarter','year'))
);

create index if not exists business_health_period_type_idx
  on public.business_health (period_type);
```

Computed fields are **NOT stored** (they are pure functions of the inputs and would drift): CAC,
ROAS, Avg LTV, LTV:CAC, End clients. They are derived client-side (section 5) — the mockup already
recomputes them live as you type, so the client is the natural home. (An API consumer could ask the
endpoint to echo them later; not needed for Phase 1.)

No RLS policy needed — admin endpoints use the service-role client and are gated in
`functions/api/_middleware.ts` (`/api/admin/*` requires `session.adminId`).

---

## 4. API

New endpoint **`command-center/app/functions/api/admin/tracker/business-health.ts`**
(agency-global tracker path per `_architecture.md`). Model it on the whitelist + audit pattern in
`functions/api/admin/clients/[tenantId].ts`.

Every handler starts with the service-client guard:
```ts
const client = getServiceClient(ctx.env);
if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
```

### GET `/api/admin/tracker/business-health?period=<key>`
- Read `period` from the query string (the caller sends the resolved period key, e.g. `2026-07`).
  Validate it is non-empty; 400 otherwise.
- `select(...).eq("period_key", period).maybeSingle()`.
- If no row: return the zero template (all inputs 0) so the UI shows an honest empty period.
- Response DTO (camelCase; snake_case columns mapped in the handler):
  ```ts
  interface BusinessHealthResponse {
    period: string;                 // echoed period_key
    periodType: "month" | "quarter" | "year";
    inputs: {
      marketingSpend: number;
      newRevenue: number;
      newMrr: number;
      startClients: number;
      newClients: number;
      churnedClients: number;
      profitMarginPct: number;
      avgRetentionMonths: number;
      avgRevenuePerClient: number;
      churnPct: number;
    };
    updatedAt: string | null;       // null when the period has no saved row yet
  }
  ```

### PATCH `/api/admin/tracker/business-health`
- Body: `{ period: string, periodType: "month"|"quarter"|"year", inputs: Partial<...> }`.
- Validate `period` non-empty and `periodType` in the enum (400 otherwise), mirroring the
  `HEALTH_STATUSES` check in the reference endpoint.
- Whitelist only the known input keys into a snake_case `update`; coerce each to a finite number,
  clamp the two percents to `0..100` and counts to `>= 0` integers. Ignore unknown keys.
- Upsert by `period_key`:
  `client.from("business_health").upsert({ period_key, period_type, ...update, updated_at: now }, { onConflict: "period_key" })`.
- `logAdminAction(client, ctx.data.admin!.id, "business_health.update", null, { period, ...update })`
  (target tenant id is `null` — agency-global).
- Return the freshly-read row via the same mapper GET uses, so the client can reconcile.

(One PATCH that upserts covers both "first save for a period" and "edit an existing period" — no
separate POST needed. The field whitelist means a single-field autosave sends just that field.)

---

## 5. Client

### DTOs — `src/lib/api.ts`
Add next to the existing admin DTOs (`AdminOverview`, `PillarConstraint`):
```ts
export interface BusinessHealthInputs { /* the 10 camelCase fields above */ }
export interface BusinessHealthResponse {
  period: string;
  periodType: "month" | "quarter" | "year";
  inputs: BusinessHealthInputs;
  updatedAt: string | null;
}
export async function getBusinessHealth(period: string): Promise<BusinessHealthResponse> {
  return api<BusinessHealthResponse>(`/api/admin/tracker/business-health?period=${encodeURIComponent(period)}`);
}
export async function saveBusinessHealth(
  period: string,
  periodType: BusinessHealthResponse["periodType"],
  inputs: Partial<BusinessHealthInputs>,
): Promise<BusinessHealthResponse> {
  return api<BusinessHealthResponse>("/api/admin/tracker/business-health", {
    method: "PATCH",
    body: JSON.stringify({ period, periodType, inputs }),
  });
}
```

### Pure lib — `src/lib/businessHealth.ts` (unit-tested; NO React)
Holds every derivation and the benchmark thresholds so nothing numeric lives in the component. Port
the mockup's `recompute()` + `bench()` verbatim in behavior.

```ts
export type PeriodType = "month" | "quarter" | "year";
export type Tone = "ok" | "watch" | "bad";
export interface BenchResult { tone: Tone; label: string; }

// Period key from a date (default: now). Mirrors the row-per-period contract.
export function periodKey(type: PeriodType, d = new Date()): string {
  const y = d.getFullYear();
  if (type === "year") return String(y);
  if (type === "quarter") return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`; // month
}

export interface Computed { cac: number; roas: number; avgLtv: number; ltvCac: number; endClients: number; }
export function computeMetrics(i: BusinessHealthInputs): Computed {
  const cac = i.newClients > 0 ? i.marketingSpend / i.newClients : 0;
  const roas = i.marketingSpend > 0 ? i.newRevenue / i.marketingSpend : 0;
  const avgLtv = i.avgRevenuePerClient * i.avgRetentionMonths * (i.profitMarginPct / 100);
  const ltvCac = cac > 0 ? avgLtv / cac : 0;
  const endClients = i.startClients + i.newClients - i.churnedClients;
  return { cac, roas, avgLtv, ltvCac, endClients };
}

// Benchmark chips. Exact thresholds from the mockup bench():
export function benchmark(kind: "cac"|"ltvCac"|"roas"|"churn"|"margin", v: number): BenchResult {
  switch (kind) {
    case "cac":    return v < 1000 ? { tone: "ok",    label: "target <$1k" }   : { tone: "bad",   label: "over $1k" };
    case "ltvCac": return v >= 3   ? { tone: "ok",    label: "healthy >3x" }   : v >= 1 ? { tone: "watch", label: "watch 1-3x" } : { tone: "bad", label: "below 1x" };
    case "roas":   return v >= 3   ? { tone: "ok",    label: "good >3x" }      : v >= 1 ? { tone: "watch", label: "thin 1-3x" }  : { tone: "bad", label: "losing money" };
    case "churn":  return v < 8    ? { tone: "ok",    label: "low <8%" }       : v <= 15 ? { tone: "watch", label: "watch" }     : { tone: "bad", label: "high >15%" };
    case "margin": return v >= 25  ? { tone: "ok",    label: "healthy" }       : v >= 10 ? { tone: "watch", label: "thin" }      : { tone: "bad", label: "low" };
  }
}
```
(Money/number formatting reuses `src/lib/format.ts` `formatMoney`; ratios render as `x.toFixed(1) + "x"`.)

### Hooks — `src/hooks/useApi.ts`
Follow the existing admin query/mutation shape (`useAdminOverviewQuery`, `useSaveConstraintMutation`):
```ts
export function useBusinessHealthQuery(period: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "tracker", "business-health", period],
    enabled: enabled && !!period,
    staleTime: 60_000,
    queryFn: () => getBusinessHealth(period),
  });
}
export function useSaveBusinessHealthMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { period: string; periodType: PeriodType; inputs: Partial<BusinessHealthInputs> }) =>
      saveBusinessHealth(v.period, v.periodType, v.inputs),
    onSuccess: (res) => {
      qc.setQueryData(["admin", "tracker", "business-health", res.period], res);
    },
  });
}
```

### Component — rebuild `src/routes/admin/AdminCommand.tsx`
Replace the whole body (drop the `useAdminOverviewQuery`/`useConstraintsQuery` wiring and every
`pk-banner`/`pk-flow`/constraints-board block). New structure:

1. `const [periodType, setPeriodType] = useState<PeriodType>("month")`; derive
   `const period = periodKey(periodType)`.
2. `useBusinessHealthQuery(period, true)` → seed a local `inputs` state (controlled inputs, like the
   mockup's tinted fields). Re-seed on `data`/`period` change (effect keyed on `period` + `updatedAt`).
3. `const computed = computeMetrics(inputs)` on every render; chips via `benchmark(...)`.
4. **Autosave**: on input change, update local state immediately (live recompute) and debounce
   (~600ms) a `saveBusinessHealth` mutation for the changed field(s). This is the tracker-cell
   editing style from `_architecture.md` (upsert on edit) adapted to a period row. A tiny "Saved"
   pulse is optional (reuse the `SaveButton` idea from `ClientConfigPanel`, not required).
5. Switching the period toggle changes `periodType` → new `period` → query refetches that row → state
   re-seeds. Nothing carries across periods.
6. Render the two panels from a small tile config array (label, tone, icon, and either
   `out: keyof Computed` for Auto tiles or `field: keyof BusinessHealthInputs` for input tiles), so
   the JSX stays flat and the tinted-palette + chip logic is shared.

Mounts at the existing `/admin` route in `App.tsx` (no route change — Foundation already points
`/admin` at `AdminCommand`). Spine "Command" entry in `AdminLayout` `SPINE_NAV` is unchanged.

Icons: reuse `lucide-react` equivalents for the inline SVGs in the mockup (e.g. `UserPlus`/`Users`,
`HeartHandshake`, `TrendingUp`, `DollarSign`, `Percent`, `Clock`, `Calendar`, `TrendingDown`).

---

## 6. Tests

`src/lib/businessHealth.test.ts` (Vitest, Node env, co-located):
- `periodKey`: month `2026-07-17` → `"2026-07"`; quarter → `"2026-Q3"`; year → `"2026"`; Q boundaries
  (Jan → Q1, Dec → Q4).
- `computeMetrics`:
  - the mockup's month sample (spend 4250, newRev 16150, avgRev 2000, ret 7, margin 30, newClients 5,
    start 3, churned 2) → cac 850, roas 3.8, avgLtv 4200, ltvCac ~4.94, endClients 6.
  - divide-by-zero guards: newClients 0 → cac 0 and ltvCac 0; spend 0 → roas 0.
- `benchmark`: each kind at both sides of every threshold, including the exact boundaries
  (cac 999/1000, ltvCac 1/3, roas 1/3, churn 8/15, margin 10/25) → correct tone + label.

(No React-render test required; the pure lib carries all the logic. Endpoint validation could get a
light `functions/lib` test later, but Phase 1 leans on the pure lib per `_architecture.md`.)

---

## 7. File-by-file change list (ordered)

1. `command-center/app/supabase/migrations/0027_business_health.sql` — new table (section 3).
2. `command-center/app/functions/api/admin/tracker/business-health.ts` — new GET + PATCH (section 4).
3. `command-center/app/src/lib/businessHealth.ts` — new pure lib: `periodKey`, `computeMetrics`,
   `benchmark`, types (section 5).
4. `command-center/app/src/lib/businessHealth.test.ts` — new unit tests (section 6).
5. `command-center/app/src/lib/api.ts` — add `BusinessHealthInputs`, `BusinessHealthResponse`,
   `getBusinessHealth`, `saveBusinessHealth`.
6. `command-center/app/src/hooks/useApi.ts` — add `useBusinessHealthQuery`,
   `useSaveBusinessHealthMutation` (+ imports).
7. `command-center/app/src/routes/admin/AdminCommand.tsx` — full rebuild into the two-panel dashboard
   with period toggle + autosave + scoped `.bh-*` style block.
8. Run `npm run db:migrate` to apply 0027.

No `App.tsx` / `AdminLayout.tsx` route or nav change (Foundation already routes `/admin` →
`AdminCommand`). If the old constraint helpers (`src/lib/adminCommand.ts`, `ConstraintPanel`) become
unreferenced after this and Foundation's removals, leave their deletion to Foundation's cleanup —
do not delete anything still imported by a kept surface.

---

## 8. Verify

- `npm run typecheck` (app + functions), `npm run build`, `npm test` all green — new tests included.
- `npm run db:migrate` applies `0027` cleanly (idempotent; safe to re-run).
- Manual, in the running app (M9 visual proof) at `/admin` as an admin:
  1. Page shows Business Health with both panels; no constraint banner/flow/board remains.
  2. Type into Marketing Spend / New Clients → CAC, ROAS, LTV:CAC recompute live; chips change tone
     at the thresholds (e.g. push CAC over $1k → chip flips to "over $1k" / bad).
  3. Start/New/Churned edits update the End breakdown and Total Clients (start + new − churned).
  4. Reload the page → the values you typed are still there (persisted to the period row).
  5. Switch to Quarter, enter different numbers, switch back to This month → each period keeps its
     own row; no bleed between periods.
  6. A brand-new period (e.g. next quarter) opens as all-zeros, not fabricated.
- Confirm no em dashes in any rendered copy.

---

## 9. Out of scope / Phase 2

- **Auto-fill from live sources** (the real meaning of a future "Auto" pill): Marketing Spend +
  New Revenue from Meta/GHL, client counts from the tenants roster + GHL pipelines, MRR from billing.
  Today `functions/api/admin/overview.ts` already computes `activeClients` and `combinedSpend`
  agency-wide truthfully — Phase 2 can pre-fill the matching inputs from there and let Jake override.
- Trend/history (period-over-period deltas, sparklines) — the table already stores one row per period,
  so this is additive later.
- CSV export / board-level rollups.
- Any `tenant_id` scoping — Business Health is deliberately agency-global.
