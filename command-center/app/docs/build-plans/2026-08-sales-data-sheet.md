# Sales Data as the sheet: spec + implementation plan

**Goal:** Replace the Sales Data page's derived day grid with a literal clone of
Jake's Google sheet: one row per sales call, the sheet's two-row summary band,
the sheet's red divider, the sheet's fills.

**Architecture:** One HTML table with a `<colgroup>`, exactly as the sheet is one
grid: rows 1-2 are the summary band, row 3 is the divider, row 4 is the column
header band, rows 5+ are the calls. The endpoint stops rolling calls into days
and returns the calls themselves. All column metadata, fills, formatting and
band arithmetic live in one pure client module so they are unit-tested without a
browser.

**Tech Stack:** React 18 + TypeScript, Cloudflare Pages Functions, Supabase
(service role), vitest.

**Source sheet:** "Sales Tracking Sheet - TEMPLATE", tab `March Sales Calls 2025`
<https://docs.google.com/spreadsheets/d/1TF-9gwOu4_61_ksSl3h7YDP4mQ0qRFUYH4I3vfMoLGk>

---

## Global Constraints

- No em dashes in any output, including code comments and UI text.
- No explanatory sub-text under any heading. The table is the whole interface.
- Every admin-facing change adds a `RELEASES` entry in `src/lib/releaseNotes.ts`
  in the same commit.
- Fills are the exact values sampled off the sheet's rendered canvas. They are
  not approximations and must not be "tidied" toward the app's palette.
- Money renders with two decimals ALWAYS (`$2,000.00`), as the sheet does. This
  is deliberately unlike `salesTracker.ts:formatMoney`, which dropped `.00`.
- Rates render with two decimals and a percent sign (`100.00%`). A rate with no
  denominator renders `0.00%`, as the sheet does, not a dash.

---

## What Jake asked for, and what it changes

Kept from the sheet: every column and every summary cell except the ones listed
below, at the sheet's own fills.

Dropped, on Jake's instruction:

| Dropped | Why |
| --- | --- |
| `Creator Pay` column | "we don't need any of that" |
| `name (creator/coach)` band cell | same |
| `Setter Pay` column | Jake sets and closes every call himself |
| `Closer Pay` column | same |
| `name (setter)` x2, `name (closer)` x2 band cells | they totalled columns that no longer exist |
| `Cash Collected After Fees` column | it IS the processing fee, and the fee is unknown |
| `CC After Fees` band cell | same |
| `Avg Close rate` (column I) | already hidden in the sheet |

Kept despite having no source in the app yet: `No 1hr Intent`, `No 1hr Intent
(%)`, `Total No Show Rate (%)`. They render 0 until something records intent.
Jake asked for them to stay as-is.

## The column schema (17 columns, in order)

| # | key | label | header fill | body fill | source |
| --- | --- | --- | --- | --- | --- |
| 1 | `apptDate` | Appointment Date | `#e6b8af` | `#e6b8af` | `scheduled_at`, formatted in the agency zone |
| 2 | `postCallForm` | Post Call Form | `#e6b8af` | `#e6b8af` | none yet, blank |
| 3 | `closer` | Assigned Closer (DON'T TOUCH) | `#000000` | `#000000` | none yet, empty chip |
| 4 | `setBy` | Set By | `#000000` | `#000000` | none yet, empty chip |
| 5 | `name` | Name | `#d9d2e9` | `#d9d2e9` | `prospect_name` then `business_name` |
| 6 | `closed` | Closed | `#fce5cd` | `#fce5cd` | chip "Closed" when `outcome === "closed"` |
| 7 | `calls` | Calls | `#ffffff` | `#ffffff` | chip "Live Call" when showed, "No Show" when `no_show` |
| 8 | `revenue` | Revenue | `#fff2cc` | `#fff2cc` | `contractValue(deal)` |
| 9 | `paymentType` | Payment Type | `#cfe2f3` | `#cfe2f3` | none yet, blank |
| 10 | `cashCollected` | Cash Collected | `#cfe2f3` | `#cfe2f3` | `cash_collected` |
| 11 | `paymentsComplete` | Payments Complete | `#cfe2f3` | `#cfe2f3` | none yet, empty chip |
| 12 | `objection` | Objection | `#cfe2f3` | `#cfe2f3` | `SALES_NO_REASONS[not_a_fit_reason].label` |
| 13 | `needsFollowUp` | Needs Follow-up | `#ead1dc` | `#ead1dc` | chip "Yes" when `outcome === "follow_up"` |
| 14 | `callNotes` | Call Notes | `#d5a6bd` | `#d5a6bd` | `scratchpad` |
| 15 | `recordingLink` | Call Recording Link | `#9fc5e8` | `#9fc5e8` | none yet, blank |
| 16 | `agencyPay` | Agency Pay | `#cfe2f3` | `#d9ead3` | `cash_collected * AGENCY_PAY_RATE` |
| 17 | `paymentStatus` | Payment Status | `#d9d9d9` | `#d9d9d9` | none yet, blank |

Chip fills, taken from the sheet: "Closed" `#d4edbc` on dark text, "Live Call"
`#11734b` on white text, "Yes" `#d4edbc` on dark text. The two black columns and
Payments Complete render an empty light chip `#e8eaed` on every row, as the
sheet's unset dropdowns do.

`AGENCY_PAY_RATE = 0.2`, the sheet's own agency share. ONE exported constant in
`src/lib/salesSheet.ts`. It moves into a settings panel in the wiring pass.

## The summary band (rows 1-2), riding the same 17-column grid

| col | row 1 label | row 2 value | label fill | value fill |
| --- | --- | --- | --- | --- |
| 1 | (blank) | (blank) | `#e6b8af` | `#e6b8af` |
| 2 | Revenue | sum of contract values | `#93c47d` | `#93c47d` |
| 3 | Cash Collected | sum of cash | `#93c47d` | `#93c47d` |
| 4 | Calls: | Calls Booked: | `#d9d2e9` | `#d9d2e9` |
| 5 | Total Calls | count | `#fce5cd` | `#fce5cd` |
| 6 | Live Calls | count | `#ffffff` | `#ffffff` |
| 7 | No Shows | count | `#fff2cc` | `#fff2cc` |
| 8 | No 1hr Intent | 0 | `#cfe2f3` | `#cfe2f3` |
| 9 | No-Close | count | `#cfe2f3` | `#cfe2f3` |
| 10 | Closed | count | `#cfe2f3` | `#cfe2f3` |
| 11 | Closing Rate (%) | pct | `#cccccc` | `#00ff00` |
| 12 | No Show Rate (%) | pct | `#cccccc` | `#e69138` |
| 13 | No 1hr Intent (%) | pct | `#cccccc` | `#e69138` |
| 14 | Total No Show Rate (%) | pct | `#cccccc` | `#e06666` |
| 15 | (blank) | (blank) | `#cfe2f3` | `#cfe2f3` |
| 16 | name (operator) | sum of agency pay | `#cfe2f3` | `#cfe2f3` |
| 17 | (blank) | (blank) | `#cfe2f3` | `#cfe2f3` |

Row 3 is a single cell spanning all 17 columns, filled `#980000`, six pixels
tall. It is the sheet's divider and it is what makes the clone read as the sheet
at a glance.

## The band arithmetic

Every total counts the month's calls after the timezone trim.

```
revenue         = sum of contractValue(parseDeal(deal)) where non-null
cashCollected   = sum of cashCollected where non-null
totalCalls      = calls whose appointment status is not dead
liveCalls       = calls whose outcome meta says showed
noShows         = calls whose outcome is "no_show"
noIntent        = 0                                  (nothing records it yet)
noClose         = showed and not won
closed          = outcome is "closed"
agencyPay       = cashCollected * AGENCY_PAY_RATE

closingRate     = closed / liveCalls
noShowRate      = noShows / totalCalls
noIntentRate    = noIntent / totalCalls
totalNoShowRate = (noShows + noIntent) / totalCalls
```

A rate whose denominator is 0 is 0, rendered `0.00%`. This mirrors the sheet,
which shows `0.00%` on an empty month, and is a deliberate departure from
`salesTracker.ts`, which rendered a dash. The sheet is the spec here.

## File structure

**Create**
- `functions/lib/salesSheetRows.ts` - the wire shape for one call, and the
  timezone month trim. Pure.
- `functions/lib/salesSheetRows.test.ts`
- `src/lib/salesSheet.ts` - columns, fills, chips, formatters, band arithmetic,
  `AGENCY_PAY_RATE`. Pure, no React.
- `src/lib/salesSheet.test.ts`
- `src/components/admin/tracker/SalesSheet.tsx` - the one table.

**Modify**
- `functions/api/admin/tracker/sales-data.ts` - return `calls` and `timeZone`
  instead of `days`, `sources`, `offers`, `reasons`.
- `src/lib/api.ts` - `SalesDataResponse` follows the endpoint.
- `src/components/admin/tracker/SalesDataTracker.tsx` - renders `SalesSheet`.
- `src/lib/releaseNotes.ts` - one `RELEASES` entry.

**Delete** (verified: nothing outside the Sales Data page imports any of these)
- `functions/lib/salesDataRollup.ts`, `functions/lib/salesDataRollup.test.ts`
- `src/lib/salesTracker.ts`, `src/lib/salesTracker.test.ts`
- `src/components/admin/sales/FullFunnel.tsx`
- `src/components/admin/sales/monthBreakdown.tsx`

`DailyTracker.tsx` stays untouched: Cold Call and Cold SMS render through it.

---

### Task 1: the wire shape and the month trim

**Files:**
- Create: `functions/lib/salesSheetRows.ts`, `functions/lib/salesSheetRows.test.ts`
- Delete: `functions/lib/salesDataRollup.ts`, `functions/lib/salesDataRollup.test.ts`

**Interfaces:**
- Consumes: `dateStringInZone` from `./tz`; `isDeadStatus`, `parseDeal`,
  `contractValue`, `isSalesCallOutcome`, `SALES_CALL_OUTCOMES` from `./salesCalls`.
- Produces: `SalesCallRow`, `SheetCall`, `toSheetCall(row): SheetCall`,
  `callsInMonth(rows, timeZone, month): SalesCallRow[]`.

```ts
export interface SheetCall {
  scheduledAt: string | null;
  name: string;
  closed: boolean;
  showed: boolean;
  noShow: boolean;
  cancelled: boolean;
  revenue: number | null;
  cashCollected: number | null;
  objection: string;
  needsFollowUp: boolean;
  notes: string;
}
```

- [ ] **Step 1: Write the failing tests.** A closed call with a 12-month deal
  produces `revenue = monthly * 12`; a month-to-month close produces
  `revenue = null`; a `no_show` sets `noShow` and leaves `showed` false; a dead
  appointment status sets `cancelled`; `callsInMonth` keeps a 9pm New York call
  in its New York month and drops the neighbouring month's rows the widened
  query window pulled in.
- [ ] **Step 2: Run and watch it fail.** `npx vitest run functions/lib/salesSheetRows.test.ts`
- [ ] **Step 3: Implement.** Lift `SalesCallRow`, `callLabel` and the body of
  `rowsInMonth` out of `salesDataRollup.ts` unchanged (already correct, already
  tested), rename `rowsInMonth` to `callsInMonth`, add `toSheetCall`.
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Delete the rollup and its test.**
- [ ] **Step 6: Commit.**

---

### Task 2: the endpoint returns calls

**Files:** Modify `functions/api/admin/tracker/sales-data.ts`

**Interfaces:**
- Consumes: `SheetCall`, `toSheetCall`, `callsInMonth` from Task 1.
- Produces: `GET /api/admin/tracker/sales-data?month=YYYY-MM` responding
  `{ calls: SheetCall[], timeZone: string, configured: boolean, sync, undated }`.

- [ ] **Step 1: Widen the select.** Add `scratchpad`. Drop `qualified` and
  `offer_variant`: the sheet has no column for either, and selecting a column no
  page reads is how a query grows without anybody noticing.
- [ ] **Step 2: Replace the rollup block.** Trim with `callsInMonth`, map with
  `toSheetCall`, sort by `scheduledAt` ascending. Count rows with no
  `scheduled_at` into `undated` exactly as before. Drop `sources`, `offers` and
  `reasons` from the body along with their `salesCalls.ts` imports.
- [ ] **Step 3: Rewrite the file header comment.** It currently explains a day
  rollup.
- [ ] **Step 4: Typecheck.** `npm run typecheck`
- [ ] **Step 5: Commit.**

---

### Task 3: the pure client module

**Files:** Create `src/lib/salesSheet.ts`, `src/lib/salesSheet.test.ts`

**Interfaces:**
- Consumes: `SheetCall` from `functions/lib/salesSheetRows`.
- Produces: `SHEET_COLUMNS`, `BAND_CELLS`, `AGENCY_PAY_RATE`,
  `bandTotals(calls)`, `bandValues(totals)`, `sheetRow(call, timeZone)`,
  `formatSheetMoney(n)`, `formatSheetPct(n)`, `formatApptDate(iso, timeZone)`.

```ts
export interface SheetColumn {
  key: string;
  label: string;
  headerFill: string;
  bodyFill: string;
  headerInk?: string;              // white on the two black columns
  align?: "left" | "right";
  width: number;
}

export interface BandCell {
  key: string;                     // the column key it sits over
  label: string;
  value: (t: BandTotals) => string;
  labelFill: string;
  valueFill: string;
  emphasis?: boolean;              // the four big bold rate cells
}

export type SheetCellValue =
  | { kind: "text"; text: string }
  | { kind: "chip"; text: string; fill: string; ink: string }
  | { kind: "empty-chip" };
```

- [ ] **Step 1: Write the failing tests.**
  - `formatSheetMoney(2000)` is `"$2,000.00"`; `formatSheetMoney(null)` is `""`.
  - `formatSheetPct(1)` is `"100.00%"`; `formatSheetPct(0)` is `"0.00%"`.
  - `bandTotals([])` gives every count 0 and every rate 0, no division by zero.
  - One closed live call, $2,000 cash, 12 x $2,000 deal: `revenue 24000`,
    `cashCollected 2000`, `totalCalls 1`, `liveCalls 1`, `closed 1`,
    `noClose 0`, `closingRate 1`, `noShowRate 0`, `agencyPay 400`.
  - One `no_show`: `liveCalls 0`, `noShows 1`, `noShowRate 1`, `closingRate 0`,
    `totalNoShowRate 1`.
  - A cancelled call is excluded from `totalCalls`.
  - `sheetRow` on a closed call yields a `chip` for `closed` and for `calls`,
    and `""` text for every column with no source yet.
  - `SHEET_COLUMNS` has 17 entries and no `setterPay`, `closerPay`,
    `creatorPay` or `ccAfterFees` key.
  - `BAND_CELLS` contains no `name (setter)`, `name (closer)` or
    `name (creator/coach)` label.
- [ ] **Step 2: Run and watch it fail.** `npx vitest run src/lib/salesSheet.test.ts`
- [ ] **Step 3: Implement.** Fills exactly as tabled above. `formatApptDate`
  uses `Intl.DateTimeFormat` with `weekday: "long", month: "long", day:
  "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName:
  "short"` and joins as `"Monday, March 9, 2026 11:30 AM - EDT"`.
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 4: the table

**Files:** Create `src/components/admin/tracker/SalesSheet.tsx`

**Produces:** `default function SalesSheet({ calls, timeZone })`.

One `<table class="shs">` with a `<colgroup>` of 17 `<col>` at the schema's
widths, then the band label row, the band value row, the six-pixel rule row
spanning 17 columns, the header row, one row per call, and blank rows padding to
30 so an empty month still looks like the sheet. Styling in a colocated
`<style>` block, as the other tracker components do. Column 1 is sticky-left.
The table scrolls inside its own `overflow-x: auto` wrapper so the page body
never scrolls sideways.

- [ ] **Step 1: Build it and typecheck.** `npm run typecheck`
- [ ] **Step 2: Commit.**

---

### Task 5: wire the page

**Files:** Modify `src/lib/api.ts`, `src/components/admin/tracker/SalesDataTracker.tsx`,
`src/lib/releaseNotes.ts`. Delete `src/lib/salesTracker.ts`,
`src/lib/salesTracker.test.ts`, `src/components/admin/sales/FullFunnel.tsx`,
`src/components/admin/sales/monthBreakdown.tsx`.

- [ ] **Step 1: Update `SalesDataResponse`.** `calls` and `timeZone` replace
  `days`, `sources`, `offers`, `reasons`. Update the doc comment: it currently
  promises a derived day.
- [ ] **Step 2: Rewrite `SalesDataTracker.tsx`.** Keep the month cursor,
  `useSalesDataQuery`, `PillarTitleActions` with `TrackerMonthNav`, and
  `StatusLine` untouched. Everything between them becomes `<SalesSheet />`.
- [ ] **Step 3: Delete the four dead files.**
- [ ] **Step 4: Add the release note.**
- [ ] **Step 5: Verify.** `npm run typecheck`, then `npx vitest run`. Both clean.
- [ ] **Step 6: Commit.**

---

### Task 6: run it

- [ ] **Step 1: Start the dev server, hand Jake the URL.**
- [ ] **Step 2: Jake compares it against the sheet side by side.**
- [ ] **Step 3: Fix whatever does not match, then ship.**
