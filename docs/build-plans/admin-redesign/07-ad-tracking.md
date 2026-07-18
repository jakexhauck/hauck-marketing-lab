# 07 — Ad Tracking (Fulfillment cockpit · Paid Ads sub-tab)

Per-client daily paid-ad funnel tracker. Manual entry (Phase 1). Lives as a new
sub-tab under the existing Paid Ads service tab of the Fulfillment cockpit
(`/admin/delivery/:tenantId?tab=paid-ads&sub=ad-tracking`).

Read `_architecture.md` and `00-foundation.md` first. This surface REUSES the
shared `DailyTracker` engine + `trackerMonth.ts` from Foundation F3, in a new
**wide** variant. If F3 is not yet built, build it first: this plan depends on it.

---

## 1. Goal / DoD

- A new **Ad Tracking** sub-tab renders under the Paid Ads cockpit tab for one
  admin-supplied tenant.
- One very wide, horizontally-scrolling daily table: one row per calendar day of
  the selected month, 26 metric columns grouped into four bands (Spend / Funnel /
  Qualify / Revenue), a sticky **Date** column, and a sticky Avg/Total footer.
- 13 columns are **input** cells (typed); 13 are **computed** ratios that update
  live as inputs change. Only inputs are stored; ratios are derived in a pure lib.
- Above the table: a rolling-window summary strip with a **4 / 7 / 30 / MTD**
  selector; the chips recompute from summed inputs over the chosen window.
- Editing a cell upserts that day's row (by `tenant_id` + `date`); the month view
  is a single GET by `year-month`. Per-client (tenant-scoped).
- Empty months render the auto-generated day grid with blank inputs and em-dash
  computed cells. Nothing is fabricated.
- The wide table scrolls inside its own container; the page body never scrolls
  horizontally. App typechecks, builds, tests green.

Phase 1 = manual entry, app DB is the source of truth. Auto-fill from Meta/GHL is
out of scope (section 9).

---

## 2. Chosen layout

Implement **`command-center/docs/mockups/admin-redesign/ad-tracking-A.html`**
(Layout A, table-first). Key structure to port:

- **Cockpit header + service tabs + Paid Ads sub-tabs** already exist in
  `DeliveryCockpit.tsx`. The mockup redraws them for context only; do NOT rebuild
  them. We add exactly one sub-tab and its body.
- **Summary strip** (`.stripwrap`): a `.winsel` pill group (4-day / 7-day / 30-day
  / MTD) on the left, then a horizontally-scrolling row of `.schip` stat chips
  (Spend, Leads, Cost/Lead, Demos, Qualified, Sales, CPA, Rev ROAS), each with a
  colored left border keyed to its band.
- **Table card** (`.tablecard`): flex column filling remaining height; a header
  strip (title + "You type / Computed" legend); then a single `.scroll` container
  (`overflow:auto`) wrapping a `min-width:1720px` table.
  - `thead` has **two sticky rows**: a group-header row (`.gh`, colspan per band,
    tinted per band) at `top:0`, and a column-label row (`.crow`) at
    `top:var(--grp-h)`. Input column labels are indigo-tinted (`.inh`).
  - `td.date` / `th.date` are `position:sticky; left:0` (the frozen Date column),
    showing `Sun 6`-style day-of-week + date, weekend and TODAY row styling.
  - Input cells are `<input inputmode="decimal">`; computed cells are read-only
    `.calc` text, right-aligned tabular-nums.
  - `tfoot` is sticky-bottom with an **Avg / day** row and a **Total MTD** row.
- Band tints reuse `--indigo` (Spend), `--sky` (Funnel), `--amber` (Qualify),
  `--green` (Revenue). Port these into `.pk-kit` theme tokens rather than raw hex
  where equivalents exist; keep Poppins display / Inter body. No em dashes in UI.

The mockup's inline `<script>` engine (COLS schema, `compute`, `fmt`, `sumInputs`,
`windowDays`, rollups) is the reference spec for the pure lib in section 6.

---

## 3. Data model

Migration `command-center/app/supabase/migrations/00NN_ad_tracking.sql` — use the
next free 4-digit number at build time (0027 if this is the first admin-redesign
surface migration; bump if Billing or another surface already claimed it). NEVER
edit an applied migration.

Table **`ad_tracking_days`** — per-client (tenant-scoped):

```sql
create table if not exists public.ad_tracking_days (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  date          date not null,
  -- Spend band inputs
  spend           numeric(12,2) not null default 0,
  impressions     integer       not null default 0,
  clicks          integer       not null default 0,
  link_clicks     integer       not null default 0,
  -- Funnel band inputs
  new_leads       integer       not null default 0,
  demos_booked    integer       not null default 0,
  -- Qualify band inputs
  qualified       integer       not null default 0,
  disqualified    integer       not null default 0,
  no_show         integer       not null default 0,
  -- Revenue band inputs
  sales           integer       not null default 0,
  contracted_rev  numeric(12,2) not null default 0,
  uf_cash         numeric(12,2) not null default 0,
  new_mrr         numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, date)
);
create index if not exists ad_tracking_days_tenant_month_idx
  on public.ad_tracking_days (tenant_id, date);
```

- 13 stored inputs only. All ratio columns (CPM, CPC, CTR, CPL, CPNL, LP Conv,
  Cost/Demo, Lead->Book, Qual %, Cost/Qual, CPA, Rev ROAS, UF ROAS) are computed
  in the client lib and are NEVER stored.
- Scoping: tenant FK per `_architecture.md` (Ad Tracking is a per-client surface).
- No enums. No RLS needed: the endpoint uses the service-role client and access is
  gated by `_middleware.ts` (admin session).
- Apply with `npm run db:migrate` (idempotent, `create table if not exists`).

---

## 4. API

File: `command-center/app/functions/api/admin/clients/[tenantId]/ad-tracking.ts`.
Admin-gated upstream by `_middleware.ts` (do not re-check auth). Start every
handler with the service client + tenant guards (copy the pattern from
`.../website/analytics.ts` and `[tenantId].ts`):

```ts
const client = getServiceClient(ctx.env);
if (!client) return 503;
const tenantId = ctx.params.tenantId as string;
const tenant = await getTenantById(client, tenantId);
if (!tenant) return 404;
```

### GET (by month)
`GET /api/admin/clients/:tenantId/ad-tracking?month=YYYY-MM`
- Validate `month` matches `^\d{4}-\d{2}$`; else 400. Default to the current
  UTC month when absent.
- Compute `[monthStart, nextMonthStart)` and query `ad_tracking_days` where
  `tenant_id = :tenantId and date >= monthStart and date < nextMonthStart`,
  ordered by `date`.
- Response: `{ month: "YYYY-MM", days: AdTrackingDay[] }` where each `AdTrackingDay`
  carries `date` (YYYY-MM-DD) + the 13 camelCase input fields. No ratios on the
  wire (client derives them). Missing days are simply absent; the client fills the
  grid from `trackerMonth.ts`.

### POST / PATCH (upsert one day)
`POST /api/admin/clients/:tenantId/ad-tracking` (PATCH accepted as an alias).
- Body: `{ date: "YYYY-MM-DD", spend?, impressions?, clicks?, linkClicks?,
  newLeads?, demosBooked?, qualified?, disqualified?, noShow?, sales?,
  contractedRev?, ufCash?, newMrr? }`.
- Validate `date`; whitelist the 13 input fields into a snake_case update object
  (numeric fields coerced with a `num()` helper, negatives clamped to 0). Reject a
  body with no `date` (400).
- Upsert on the `(tenant_id, date)` unique constraint (Supabase
  `.upsert(row, { onConflict: "tenant_id,date" })`), set `updated_at = now()`.
- `logAdminAction(client, ctx.data.admin!.id, "client.adTracking.upsert",
  tenantId, { date, fields })` on success. Return the saved row
  `{ day: AdTrackingDay }` so the client can reconcile.

All month-boundary + whitelist logic that is pure (month range, field
whitelisting) should live in / reuse a tested helper so it is not trapped in the
handler.

---

## 5. Client

### DTOs — `src/lib/api.ts`
```ts
export interface AdTrackingDay {
  date: string;            // YYYY-MM-DD
  spend: number; impressions: number; clicks: number; linkClicks: number;
  newLeads: number; demosBooked: number;
  qualified: number; disqualified: number; noShow: number;
  sales: number; contractedRev: number; ufCash: number; newMrr: number;
}
export interface AdTrackingMonthResponse { month: string; days: AdTrackingDay[]; }
export type AdTrackingInput = Partial<Omit<AdTrackingDay, "date">> & { date: string };
```

### Hooks — `src/hooks/useApi.ts`
- `useAdminAdTrackingQuery(tenantId, month)` — key
  `["admin","tracker","ad-tracking", tenantId, month]`,
  `queryFn: () => api<AdTrackingMonthResponse>(\`/api/admin/clients/${tenantId}/ad-tracking?month=${month}\`)`,
  `enabled: !!tenantId && !!month`, `staleTime: 30_000`.
- `useAdminAdTrackingSaveMutation(tenantId, month)` — `mutationFn` POSTs one
  `AdTrackingInput`. Optimistic `onMutate` (snapshot the month query, merge the
  edited day into `days`, rollback on error), `onSettled: invalidateQueries` on the
  month key. Mirror the existing optimistic row-edit mutations in `useApi.ts`.

### Pure metrics lib — `src/lib/adTrackingMetrics.ts` (new; do NOT reuse the
client-facing `adsTracker.ts`, which is a different sheet)
- `AD_TRACKING_COLUMNS`: the 26-column schema ported verbatim from the mockup
  `COLS` (band, key, label, `input:boolean`, format token). Order and grouping
  match the mockup exactly (Spend 9 cols, Funnel 5, Qualify 5, Revenue 7).
- `AD_TRACKING_GROUPS`: band id -> label + tint token, in order.
- `computeAdTrackingRatios(inputs)`: pure, returns the 13 ratios (or `null` when
  the denominator is 0), formulas ported verbatim from the mockup `compute()`:
  CPM=spend/impr*1000, CPC=spend/clicks, CTR=clicks/impr*100, CPL=spend/linkClicks,
  CPNL=spend/newLeads, LPConv=newLeads/linkClicks*100, CostDemo=spend/demos,
  Lead->Book=demos/leads*100, Qual%=qualified/demos*100, CostQual=spend/qualified,
  CPA=spend/sales, RevROAS=contractedRev/spend, UFROAS=ufCash/spend.
- `formatMetric(token, value)`: `$` (round), `$$` (2dp), `#` (int, grouped), `%`
  (1dp), `x` (2dp), `null -> "—"`.  (Em-dash used in DATA display only, never in
  source prose — this is the standard empty glyph the mockup already ships.)
- `rollupWindow(days, window)`: sum the 13 inputs over the window's days, then run
  `computeAdTrackingRatios` on the SUMMED inputs (ratios of sums, never averages of
  ratios). `window` = `4 | 7 | 30 | "mtd"` resolved via `trackerMonth.ts` day
  helpers (window ends at today, or the last day of a past month).
- `SUMMARY_CHIPS`: the 8 strip chips (key, label, band tint, format, getter over
  `{sums, ratios}`), ported from the mockup `STRIP`.

Prefer to route month-day generation, weekend/today flags, Avg/Total footer math,
and window-day resolution through F3's `trackerMonth.ts`; only the ad-specific
column schema, ratio formulas, and chip config are new here.

### Components — `src/components/admin/cockpit/paidads/`
1. `PaidAdsTab.tsx` — mirrors `WebDesignTab.tsx`: `switch (activeSub)` for the
   Paid Ads sub-tabs; `case "ad-tracking": return <AdTrackingPanel tenantId={...}/>`;
   the other three sub-tabs (`campaigns`, `ad-library`, `data-leads`) return the
   honest `pk-empty` "still building this view" placeholder until their own phases.
2. `AdTrackingPanel.tsx` — the surface body:
   - Reads `useAdminAdTrackingQuery(tenantId, month)`; local `month` state
     (default current month) + prev/next/Today month nav.
   - Renders the `RollingSummaryStrip` (window selector + chips) above the table.
   - Renders `<DailyTracker variant="wide" .../>` (F3) fed the
     `AD_TRACKING_COLUMNS` schema, `AD_TRACKING_GROUPS`, the month's `days` mapped
     onto the generated grid, `computeRow = computeAdTrackingRatios`, footer
     rollup helpers, and `onEdit(date, field, value)` -> save mutation.
   - Loading / error states via `pk-empty` (no filler copy).
3. `RollingSummaryStrip.tsx` — the `.stripwrap` (winsel + `.schip` row); local
   `window` state; chips from `rollupWindow` + `SUMMARY_CHIPS`.

### Shared engine additions — `src/components/admin/tracker/DailyTracker.tsx` (F3)
The base `DailyTracker` renders a narrow single-band table. Add a **wide** variant
(new props, additive, default keeps F3 surfaces unchanged):
- `variant?: "standard" | "wide"` (default `"standard"`).
- `columnGroups?: TrackerGroup[]` — when present, render the two-row grouped
  `thead` (band header row + column-label row) and the sticky Date column; put the
  table inside its own `overflow:auto` scroll container capped at the tenant width
  (`min-width` from the schema). Port the `.gh` / `.crow` / `.date` / sticky-tfoot
  CSS from the mockup into the `.pk-kit` tracker styles.
- Column schema entries gain `group` + `format` fields (already implied by F3's
  input-vs-computed split).
Keep the edit contract identical: one editable cell -> `onEdit(day, field, value)`
-> one upsert. The wide variant is purely presentational.

### Sub-tab registration — `src/lib/deliveryCockpit.ts`
Set the Paid Ads `subTabs` to match the mockup (Campaigns · Ad Library · Ad
Tracking · Data & Leads) and mark Ad Tracking ready:
```ts
subTabs: [
  { id: "campaigns", label: "Campaigns", ready: false },
  { id: "ad-library", label: "Ad Library", ready: false },
  { id: "ad-tracking", label: "Ad Tracking", ready: true },
  { id: "data-leads", label: "Data & Leads", ready: false },
],
```
(The old `funnel` placeholder sub-tab is replaced by `ad-tracking`, matching the
approved mockup. Update the unit test in `deliveryCockpit.test.ts` accordingly.)

### Mount — `src/routes/admin/DeliveryCockpit.tsx`
Add a branch to the render switch, before the generic placeholder:
```tsx
) : activeService === "paid-ads" ? (
  <PaidAdsTab tenantId={tenantId} activeSub={activeSub ?? "campaigns"} />
) : ...
```

---

## 6. Tests

Co-located Vitest (`*.test.ts`, Node env). Pure logic only:

- `src/lib/adTrackingMetrics.test.ts`:
  - `computeAdTrackingRatios`: every ratio with a nonzero denominator matches the
    mockup formula; every ratio returns `null` when its denominator is 0 (no
    NaN/Infinity). Spot-check with the mockup's July-6 seed row (spend 100, impr
    9200, clicks 158, link 121, leads 7, demos 3, qual 2, sales 1, contracted
    1200, uf 600): CPM ~= 10.87, CTR ~= 1.72%, CPNL ~= 14.29, Rev ROAS = 12.00x.
  - `formatMetric`: each token ($, $$, #, %, x) and the `null -> "—"` case.
  - `rollupWindow`: ratios are computed from summed inputs (assert a case where
    average-of-ratios would differ from ratio-of-sums); 4/7/30/MTD window day
    selection resolves correctly at month start, mid-month, and month end; a fully
    empty window yields zero sums + null ratios.
- `src/lib/deliveryCockpit.test.ts` (extend): `resolveSubTab("paid-ads", ...)`
  returns `ad-tracking` for that value and the first sub-tab (`campaigns`) for an
  invalid one; `subTabsFor("paid-ads")` includes `ad-tracking`.
- If any month-range / field-whitelist helper is extracted from the endpoint,
  unit-test it (valid/invalid `month`, unknown fields dropped, negatives clamped).

---

## 7. File-by-file change list (ordered)

1. `supabase/migrations/00NN_ad_tracking.sql` — new table (section 3).
2. `functions/api/admin/clients/[tenantId]/ad-tracking.ts` — GET(by month) +
   POST/PATCH upsert (section 4).
3. `src/lib/adTrackingMetrics.ts` — column schema, groups, ratio compute, format,
   window rollup, summary chips (section 5).
4. `src/lib/adTrackingMetrics.test.ts` — unit tests (section 6).
5. `src/lib/api.ts` — `AdTrackingDay`, `AdTrackingMonthResponse`,
   `AdTrackingInput` DTOs.
6. `src/hooks/useApi.ts` — `useAdminAdTrackingQuery`, `useAdminAdTrackingSaveMutation`.
7. `src/components/admin/tracker/DailyTracker.tsx` — add the `wide` variant +
   grouped-band / sticky-Date rendering (F3 engine extension).
8. `src/components/admin/cockpit/paidads/RollingSummaryStrip.tsx` — new.
9. `src/components/admin/cockpit/paidads/AdTrackingPanel.tsx` — new.
10. `src/components/admin/cockpit/paidads/PaidAdsTab.tsx` — new (sub-tab router).
11. `src/lib/deliveryCockpit.ts` — Paid Ads `subTabs` update (add `ad-tracking`,
    ready:true).
12. `src/lib/deliveryCockpit.test.ts` — extend for the new sub-tab.
13. `src/routes/admin/DeliveryCockpit.tsx` — mount `PaidAdsTab` in the switch.
14. `.pk-kit` tracker CSS (wherever F3's tracker styles live) — port the wide
    table / grouped header / sticky column + footer styles from the mockup.

---

## 8. Verify

- `npm run typecheck` (app + functions), `npm run build`, `npm test` all green.
- `npm run db:migrate` applies `00NN_ad_tracking.sql` cleanly (idempotent re-run).
- Boot the app, open `/admin/delivery/:tenantId?tab=paid-ads&sub=ad-tracking`:
  - The month grid renders every day; today + weekends styled; empty inputs show
    placeholders and computed cells show "—".
  - Type in an input cell -> its row's ratios, the Avg/Total footer, and the
    summary chips recompute live; the value persists (reload the month, it is
    still there; confirm one `ad_tracking_days` row upserted by `(tenant_id,date)`).
  - Switch the summary window 4/7/30/MTD -> chips change; switch months with the
    nav -> the correct month loads.
  - The table scrolls horizontally inside its own container; the page/body does
    NOT scroll horizontally (check at 1440 and 1024 widths).
  - Other Paid Ads sub-tabs still show the honest placeholder, not filler.

---

## 9. Out of scope / Phase 2

- Auto-fill Spend / Impressions / Clicks / Link Clicks from the Meta insights the
  agency already pulls (`meta_ad_account_id`), and New Leads / Demos / Qualified /
  Sales / Revenue from the client's GHL pipeline, so most inputs prefill and Jake
  only corrects. Phase 2 will add a resolver that merges auto values with
  manual overrides on the same `(tenant_id, date)` row.
- Client-facing read-only view of this data (Paid Ads Overview already shows a
  summary; this cockpit tracker stays admin-only in Phase 1).
- Cross-client rollups / benchmarking and CSV export.
