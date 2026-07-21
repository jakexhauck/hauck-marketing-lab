# Task 9 report: the metric strip, honestly

## Files created

- `command-center/app/src/lib/setterRates.ts` - pure logic. `computeSetterRateStrip(leads)` takes
  the minimal shape `{ contacted: boolean; lastOutcome: string | null }[]` and returns the five
  tile view-models in the client's exact order and wording. `safeRate(numerator, denominator)`
  returns `null` on a zero denominator instead of NaN/Infinity/a fake zero. Show rate and Close
  rate are hardcoded `pending: true` unconditionally, independent of input, mirroring
  `functions/lib/setterMetrics.ts`'s `Rates` type (`showRate`/`closeRate` typed as literal `null`).
- `command-center/app/src/lib/setterRates.test.ts` - TDD tests, written and run-to-fail before
  `setterRates.ts` existed (confirmed: `Failed to load url ./setterRates`). 7 tests: tile
  order/wording, show/close always pending even with a fully-booked non-empty input (guards against
  both a fake number and a fake zero), total-leads count including zero, contact-rate percent,
  booking-rate percent, zero-lead denominator never NaN/Infinity, and a genuine 0% distinguished
  from pending (leads exist, none contacted/booked yet).
- `command-center/app/src/components/admin/SetterRateStrip.tsx` - new presentational component.
  Deliberately placed outside `src/components/admin/setter/` (two other fix tasks are editing that
  folder). Renders `.pk-report` / `.pk-report-tile` (already mounted globally by
  `PillarStyle`/`AdminLayout.tsx`, no new CSS needed), applies `.pk-pending` when a tile is pending,
  and shows the formula as a small mono sub-label (`font-data text-[10.5px] text-faint`). Numerals
  use `font-data tabular-figs`; pending tiles never render `tabular-figs` since they hold text
  ("No leads yet" / "Needs close-out flow"), not a number.

## Files modified

- `command-center/app/src/routes/admin/SetterSuite.tsx` - imported `SetterRateStrip` and rendered
  it as the first element inside the "client + pipeline loaded" branch, above the pipeline tabs, so
  it sits at the top of the page. Fed `leadsQuery.data?.leads ?? []`, the exact array the board
  below it already has in memory. No new query, no new endpoint, no per-card fetch.

## Where each number comes from

- **Total leads in** (`count of leads`): `leads.length` from the already-loaded
  `useSetterLeadsQuery` response for the active pipeline. Always a real number, zero included.
- **Contact rate** (`contacted / leads`): `ApiSetterLead.contacted`, which `functions/api/admin/setter/leads.ts`
  already derives from the `setter_dials` roll-up (`rollUpByContact`). Real data, already on the
  client, no guess.
- **Booking rate** (`booked / leads`): counts leads whose `ApiSetterLead.lastOutcome === "booked"`.
  `"booked"` is a real entry in `functions/api/admin/setter/dials.ts`'s `OUTCOMES` enum, the exact
  outcome a setter logs the moment they lock in a time via "Log this call" in the cockpit. This is
  a different (and honestly available) signal than `functions/lib/setterMetrics.ts`'s
  `computeRates`, which sources booking from a GHL appointments list that `leads.ts` does not fetch
  and that I was told not to add. Using the dial outcome already carried on every board card avoids
  a new fetch while staying truthful: a lead only gets counted once a setter has actually logged a
  successful booking call for it.
- **Show rate** (`showed / booked`) and **Close rate** (`won / showed`): no source exists yet
  (Estimate/Job close-out flows are unbuilt). Always `pending: true`, text "Needs close-out flow",
  regardless of input, matching `computeRates`'s literal-`null` typing.

## Zero-lead / zero-denominator handling

`safeRate` returns `null` (never NaN/Infinity) whenever the denominator is 0. The strip then shows
"No leads yet" via the same `.pk-pending` treatment rather than a fabricated "0%" for Contact rate
and Booking rate. A genuine 0% (leads exist, none contacted/booked) still renders as a real 0%,
covered by its own test. Verified against the current zero-lead test account by reasoning through
the pure function (all inputs empty array): total = "0" (not pending), contact/booking = pending
"No leads yet", show/close = pending "Needs close-out flow". No broken/NaN tiles.

## Commands run

```
npx vitest run src/lib/setterRates.test.ts   # red: module not found (pre-implementation)
npx vitest run src/lib/setterRates.test.ts   # green: 7/7 passed (post-implementation)
npm test          # 89 files, 944 tests, all passed
npm run typecheck # tsc --noEmit (app) + tsc --noEmit -p functions/tsconfig.json, clean
npm run build     # tsc && vite build, succeeded (pre-existing >500kB main-chunk warning, unrelated)
```

## Full `npm test` tail

```
 Test Files  89 passed (89)
      Tests  944 passed (944)
```

(Full per-file listing was inspected during the run; every suite, including the new
`src/lib/setterRates.test.ts`, `functions/lib/setterMetrics.test.ts`, and
`functions/api/admin/setter/leads.test.ts`, passed. No suite skipped or failed.)

## Deviations

- Did not use `functions/lib/setterMetrics.ts`'s `computeRates` directly: it is a backend-only
  Pages Function module (not part of the Vite frontend bundle) and its booking-rate signature
  needs a GHL appointments array that `functions/api/admin/setter/leads.ts` does not fetch. Wrote
  a parallel, frontend-only pure function (`src/lib/setterRates.ts`) that derives the same three
  live rates from data the board already has, with an equivalent honesty guarantee (show/close
  permanently pending, zero-denominator never fabricated).
- Booking rate is defined via dial outcome (`lastOutcome === "booked"`) rather than a live GHL
  appointment lookup. This is a real, already-loaded signal tied to the actual booking workflow,
  not a guess, but it is a narrower definition than "has an appointment in GHL" and could
  undercount if a booking is ever made without a setter logging the call outcome. Worth flagging to
  Jake/Hermes if that gap matters before this goes live.
- Did not touch `src/components/pillars/PillarKit.tsx` (where `.pk-report-tile.pk-pending` is
  defined) since it is already mounted globally for the whole admin via `AdminLayout.tsx`'s
  `PillarStyle`, and editing a shared, sitewide CSS file felt riskier than reusing what's already
  available. No new global CSS was added; the formula sub-label uses existing Tailwind utility
  classes (`font-data`, `text-faint`) only.

## Concerns

- The rate strip reflects only the currently active pipeline's leads (whatever
  `useSetterLeadsQuery` has loaded), not a cross-pipeline total for the client, since the leads
  endpoint is scoped to one pipeline and I was told not to add a new endpoint or extra fetches.
  If Jake wants a true client-wide "Total leads in" across every pipeline, that needs either a new
  aggregate endpoint or N pipeline fetches, both out of scope here.
- Booking-rate-via-dial-outcome (see Deviations) should be sanity-checked against real usage once
  setters are actually logging calls; if bookings routinely happen without a "booked" dial log,
  the rate will undercount.
