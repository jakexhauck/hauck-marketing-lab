# Final pre-merge fix batch: Setter Suite

Six findings from the final review, fixed in one pass, in the worktree
`C:\Users\games\Desktop\hml-worktrees\setter-suite`.

## Finding 1 (BLOCKER): dials lookup fails on a real-sized pipeline

`functions/api/admin/setter/leads.ts` was calling `.in("contact_id", contactIds)`
with up to 1000 unbatched CRM ids, which postgrest-js serializes straight into
the GET query string. A pipeline with a few hundred leads could build a query
string long enough for Supabase's edge to reject, 500ing the whole board.

**Change:**
- Added a generic `chunk<T>(items: T[], size: number): T[][]` helper to
  `functions/lib/setterMetrics.ts` (kept next to `rollUpByContact`, which
  `leads.ts` already imports from there).
- `leads.ts` now batches `contactIds` into groups of 100, runs the batches in
  parallel via `Promise.all`, checks all results for an error before merging,
  then rolls up the merged dial rows.
- Also removed `computeRates` from the same file per Finding 6 (see below);
  it lived right next to `chunk`.

**Tests (TDD: written first, run, seen failing, then implemented):**
`functions/lib/setterMetrics.test.ts`, new `describe("chunk", ...)` block:
- empty list -> `[]`
- fewer ids than one batch -> one batch
- exactly one batch (100 items, size 100) -> one batch of 100
- more than one batch (250 items, size 100) -> three batches (100/100/50),
  flattened order preserved

## Finding 2 (BLOCKER): rate strip shows a synthetic zero on a failed fetch

`SetterRateStrip` was rendered above `leadsQuery.isError` in
`src/routes/admin/SetterSuite.tsx`, so a failed leads fetch showed
"Total leads in: 0" directly above the board's own error state.
`computeSetterRateStrip` could not tell "zero leads" from "no data".

**Change:**
- `src/lib/setterRates.ts`: `computeSetterRateStrip` now takes a second
  `failed = false` parameter. When `true`, all five tiles go `pending: true`
  with `value: ""` and a `pendingReason` of `"Could not load leads"`
  (distinct from the pre-existing `"No leads yet"` zero-denominator copy and
  the `"Needs close-out flow"` missing-feature copy, so the three pending
  reasons never get confused with each other).
- `src/components/admin/SetterRateStrip.tsx`: added a `failed?: boolean`
  prop, threaded straight through to `computeSetterRateStrip`.
- `src/routes/admin/SetterSuite.tsx`: `<SetterRateStrip ... failed={leadsQuery.isError} />`.

**Tests (TDD):** `src/lib/setterRates.test.ts`, three new cases:
- a failed fetch with non-empty, fully-contacted/fully-booked input still
  marks all five tiles pending with no value (proves it isn't just reusing
  the zero-denominator path)
- the failure copy and the honest-empty copy are provably different strings
- an empty array with `failed: false` still renders the honest zero-leads
  copy, unchanged from before

## Finding 3 (BLOCKER): partly-applied tag write leaves stale tags on screen

`useSetterTagsMutation` (`src/hooks/useApi.ts`) only had `onSuccess`. The
tags endpoint applies removes then adds as two separate CRM calls; if the
remove succeeds and the add throws, the CRM's tags already changed but the
cockpit kept showing the pre-write list.

**Change:** added `onSettled` that invalidates
`["admin", "setter", "lead", tenantId, contactId]` unconditionally, so the
detail query always re-fetches the CRM's real state after a write, success
or failure. `onSuccess`'s optimistic cache write is kept for the fast,
non-flickering common case; `onSettled` is the safety net.

No new test added (this hook has no existing render/mutation test harness in
this repo: `vitest.config.ts` only includes `*.test.ts`, environment is
`node`, and there is no `@testing-library/react` install anywhere in the
codebase to exercise a `useMutation` against a live `QueryClient`). Verified
by reading the `onSettled` contract against React Query's own semantics
(runs after success or error) and by typecheck/build passing.

## Finding 4 (BLOCKER): every keystroke fires two live CRM calls

`SlotPicker.tsx`'s `calendarName` state fed the query key directly with no
debounce, and defaulted to the Willis-shaped `"Home Estimate"`.

**Change:**
- Added a 400ms-debounced `debouncedCalendarName` state, updated via a
  `setTimeout`/`clearTimeout` effect keyed on `calendarName`. The live
  query (`useSetterSlotsQuery`) now keys off `debouncedCalendarName`, not
  the raw keystroke value.
- Default value changed from `"Home Estimate"` to `""`. `useSetterSlotsQuery`
  already gates on a non-empty name, so an empty/untouched field fires no
  request.
- Added an explicit "Enter a calendar name to see available times." prompt
  for the empty-debounced-name state, so the panel never falls into the
  generic "No open times" message when nothing has been entered yet.
- Every other render branch (loading, needs-staff, not-found, generic error,
  empty grid, slot grid) now also gates on `debouncedCalendarName` being
  non-empty, so nothing can flash mid-typing.
- The Book mutation now sends `calendarName: debouncedCalendarName` (the
  value the displayed slots were actually fetched against) instead of the
  raw field, so a booked slot can never be attributed to a calendar name the
  slots were never fetched for.
- Booking's non-retry behaviour (`retry: false` in `useSetterBookMutation`)
  was not touched.

No new test added, same reasoning as Finding 3 (no component/hook test
harness in this repo). Verified by reading through the render-branch gating
by hand and by typecheck/build passing.

## Finding 5: `getGhlContextForTenant` had no tests

`functions/lib/tenantGhl.test.ts` only tested `isPlaceholder`. This function
is the only thing stopping the Setter Suite from falling back to
`resolveGhlCreds`'s env-var credentials, which belong to a live production
client.

**Change:** rewrote `tenantGhl.test.ts`, mocking `./supabase` wholesale (same
seam as the existing `functions/lib/googleCalendar.test.ts` pattern: replace
the module binding rather than spy on it) with a stub chain for
`client.from("tenants").select(...).eq("id", ...).maybeSingle()`. Added:
- `it.each(["", "pending", "env"])` for both fields placeholder together
- `it.each(["", "pending", "env"])` for only `ghl_location_id` placeholder
- `it.each(["", "pending", "env"])` for only `ghl_token` placeholder
- `tenant_not_found` when the row is `null`
- returns the tenant's real creds unchanged when both fields are real
- explicit sentinel-leak test: `env.GHL_LOCATION_ID` /
  `env.GHL_TOKEN` are set to obviously-wrong sentinel strings
  (`ENV-SENTINEL-LOCATION-DO-NOT-USE` / `ENV-SENTINEL-TOKEN-DO-NOT-USE`); the
  test asserts the returned context never contains them, on the success path
  (the placeholder-case tests already prove the failure path throws instead
  of falling back)
- bonus: `tenant_lookup_failed` on a raw Supabase error, also proving it
  does not fall through to env creds on that path either

Kept the original `isPlaceholder` describe block unchanged. Did not touch
`tenantGhl.ts` itself, `tenantResolve.ts`, or any endpoint's use of
`getGhlContextForTenant` (constraint: tenant-credential handling unchanged).

## Finding 6: dead `computeRates`, drifted from the live rate strip

`computeRates` in `functions/lib/setterMetrics.ts` was imported by nothing
except its own test; the live rate strip computes booking rate client-side
in `src/lib/setterRates.ts` with a different implementation.

**Change:** deleted `computeRates`, its `Rates` type, and its
`describe("computeRates", ...)` test block. Left `rollUpByContact` and its
tests completely untouched. Updated one stale comment in
`src/lib/setterRates.ts` that referenced the now-deleted `Rates` type.
Confirmed via repo-wide grep that nothing else referenced `computeRates`.

## Commands run

```
cd command-center/app
npx vitest run functions/lib/setterMetrics.test.ts   # TDD red, then green
npx vitest run src/lib/setterRates.test.ts            # TDD red, then green
npx vitest run functions/lib/tenantGhl.test.ts         # new tests, green
npm test
npm run typecheck
npm run build
```

## Final verification output

### `npm test`

```
 Test Files  89 passed (89)
      Tests  958 passed (958)
   Duration  3.62s (transform 3.53s, setup 0ms, collect 10.72s, tests 1.06s, environment 23ms, prepare 15.36s)
```

### `npm run typecheck`

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```

(no output, exit 0: clean)

### `npm run build`

```
> client-dashboard@0.1.0 build
> tsc && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 2256 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js               0.13 kB
dist/manifest.webmanifest        0.44 kB
dist/index.html                  1.47 kB │ gzip:   0.64 kB
dist/assets/index-BnF8-Bth.css  105.45 kB │ gzip:  18.41 kB
dist/assets/index-Cfw_D_j6.js   1,514.75 kB │ gzip: 396.17 kB
✓ built in 4.89s

PWA v1.3.0
Building src/sw.ts service worker ("es" format)...
✓ 88 modules transformed.
✓ built in 154ms

PWA v1.3.0
mode      injectManifest
format:   es
precache  19 entries (2663.95 KiB)
files generated
  dist/sw.js
```

(the >500kB chunk-size warning predates this change and is unrelated to any
of the six findings)

## Constraints honoured

- No em dashes anywhere in the diff (grepped every changed file).
- No "GoHighLevel"/"GHL" added to any UI-facing copy (checked the `src/`
  diff specifically; internal comments still say GHL/CRM where the existing
  file already did).
- No raw hex colors added; only text/logic changes.
- `getGhlContextForTenant` untouched; every setter endpoint still uses it;
  `resolveGhlCreds` untouched and still unused by any setter endpoint.
- `useSetterBookMutation`'s `retry: false` and its call sites' non-retry
  discipline untouched.

## Fix pass 2 - loading state

Re-review found Finding 2 was only half closed: the failed-fetch path was
fixed, but `SetterRateStrip` never gated on `leadsQuery.isLoading`. During
every initial page load, client switch, or pipeline switch, `leadsQuery.data`
is `undefined`, `leads` falls back to `[]`, `failed` is `false`, and
`computeSetterRateStrip([], false)` returned an honest-looking, non-pending
"Total leads in: 0". That is the exact synthetic-zero problem the original
blocker targeted, reached through the loading path instead of the error
path.

**Root cause:** `computeSetterRateStrip` took a `failed: boolean` second
parameter. A boolean can only express two states; the function needed to
distinguish three (loading, failed, ready-including-genuinely-empty), and the
loading case had no representation at all.

**Change:**
- `src/lib/setterRates.ts`: replaced the `failed = false` boolean parameter
  with a single explicit `status: SetterRateStripStatus = "ready"`, where
  `SetterRateStripStatus = "loading" | "failed" | "ready"` (new exported
  type). `totalLeads`, `contactRate`, and `bookingRate` are now driven off
  `status`:
  - `"loading"`: all three pending, `value: ""`, `pendingReason: "Loading leads..."` (new `LOADING_REASON` constant). This holds even if a non-empty
    `leads` array is passed in (e.g. stale cached data mid-refetch): loading
    never renders a number, full stop.
  - `"failed"`: all three pending, `value: ""`, `pendingReason: "Could not load leads"` (unchanged `FAILED_REASON`).
  - `"ready"`: unchanged prior behaviour. `totalLeads` is always a real
    count, including a genuine `"0"`. `contactRate`/`bookingRate` are
    pending with `"No leads yet"` only on a zero denominator.
  - `showRate` and `closeRate` now use a single `CLOSE_OUT_REASON` constant
    ("Needs close-out flow") unconditionally, in all three states. This is a
    deliberate behaviour change from fix pass 1, where a failed fetch used
    to overwrite their reason with `FAILED_REASON` too. Their data does not
    exist regardless of what the leads query is doing, so their copy no
    longer moves with fetch status.
- `src/components/admin/SetterRateStrip.tsx`: `failed?: boolean` prop
  replaced with `status?: SetterRateStripStatus` (default `"ready"`),
  threaded straight through.
- `src/routes/admin/SetterSuite.tsx`: the strip now reads
  `status={leadsQuery.isLoading ? "loading" : leadsQuery.isError ? "failed" : "ready"}`
  instead of `failed={leadsQuery.isError}`.

**Tests (TDD: written first, run, seen failing, then implemented):**
`src/lib/setterRates.test.ts` was rewritten to call with the new
`"loading" | "failed" | "ready"` string status everywhere (all 8 pre-existing
cases updated in place, still asserting the same behaviour they always did)
plus 6 new cases:
- show/close keep `"Needs close-out flow"` in the loading state
- show/close keep `"Needs close-out flow"` in the failed state (proves the
  pass-1 failure-copy override is gone)
- `totalLeads`/`contactRate`/`bookingRate` never render a number while
  loading, on an empty array
- loading and failed produce distinct `pendingReason` copy from each other
  on `totalLeads` (the "read differently to a user" requirement)
- loading never renders a number even given a non-empty `leads` array
  (stale-cache-mid-refetch guard)
- default parameter (`status` omitted) behaves as `"ready"`

Ran `npx vitest run src/lib/setterRates.test.ts` before implementing:
14 of 16 tests failed (the 2 that passed were cases where old-boolean and
new-string-status coincidentally computed the same thing). Confirmed genuine
red, then implemented, then green.

### Three-state behaviour: `computeSetterRateStrip(leads, status)`, `totalLeads` tile

| Status | `pending` | `value` | `pendingReason` |
|---|---|---|---|
| `"loading"` | `true` | `""` | `"Loading leads..."` |
| `"failed"` | `true` | `""` | `"Could not load leads"` |
| `"ready"`, empty leads (genuine zero) | `false` | `"0"` | `null` |
| `"ready"`, non-empty leads | `false` | count as string | `null` |

No state other than genuine `"ready"` emptiness produces a non-pending
value, and genuine emptiness always renders a real `"0"`, never pending.

`showRate`/`closeRate` are `pending: true`, `value: ""`,
`pendingReason: "Needs close-out flow"` in all three states, unconditionally.

## Commands run (fix pass 2)

```
cd command-center/app
npx vitest run src/lib/setterRates.test.ts   # TDD red (14/16 failing), then green (16/16)
npm test
npm run typecheck
npm run build
```

## Final verification output (fix pass 2)

### `npm test`

```
 Test Files  89 passed (89)
      Tests  964 passed (964)
   Duration  3.58s (transform 3.59s, setup 0ms, collect 10.72s, tests 997ms, environment 22ms, prepare 14.94s)
```

### `npm run typecheck`

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```

(no output, exit 0: clean)

### `npm run build`

```
> client-dashboard@0.1.0 build
> tsc && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 2256 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js               0.13 kB
dist/manifest.webmanifest        0.44 kB
dist/index.html                  1.47 kB │ gzip:   0.64 kB
dist/assets/index-BnF8-Bth.css  105.45 kB │ gzip:  18.41 kB
dist/assets/index-CgisYI1W.js   1,514.87 kB │ gzip: 396.22 kB
✓ built in 4.70s

PWA v1.3.0
Building src/sw.ts service worker ("es" format)...
✓ 88 modules transformed.
✓ built in 155ms

PWA v1.3.0
mode      injectManifest
format:   es
precache  19 entries (2664.06 KiB)
files generated
  dist/sw.js
```

(same pre-existing >500kB chunk-size warning as fix pass 1, unrelated to
this change)

## Constraints honoured (fix pass 2)

- No em dashes anywhere in the diff (grepped every changed file, no matches).
- No "GoHighLevel"/"GHL" added to any UI-facing copy; the new copy strings
  are `"Loading leads..."`, `"Could not load leads"`,
  `"Needs close-out flow"`, none of which name a CRM.
- No raw hex colors added; `SetterRateStrip.tsx`'s markup and `pk-report`/
  `pk-pending` classes are untouched, only the prop and the values flowing
  through them changed.
- Files touched: only `src/lib/setterRates.ts`, `src/lib/setterRates.test.ts`,
  `src/components/admin/SetterRateStrip.tsx`, and
  `src/routes/admin/SetterSuite.tsx`, as scoped.
