# Task 3 Report: Setter Metrics Derivation

## Files Created

- `command-center/app/functions/lib/setterMetrics.ts` (implementation)
- `command-center/app/functions/lib/setterMetrics.test.ts` (test suite)

## Test Command

```bash
npx vitest run functions/lib/setterMetrics.test.ts
```

## Failing Test Run (Step 2)

```
 RUN  v2.1.9 C:/Users/games/Desktop/hml-worktrees/setter-suite/command-center/app

 ❯ functions/lib/setterMetrics.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  functions/lib/setterMetrics.test.ts [ functions/lib/setterMetrics.test.ts ]
Error: Failed to load url ./setterMetrics (resolved id: ./setterMetrics) in C:/Users/games/Desktop/hml-worktrees/setter-suite/command-center/app/functions/lib/setterMetrics.test.ts. Does the file exist?
 ❯ loadAndTransform node_modules/vitest/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51969:17

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  no tests
   Start at  14:23:11
   Duration  492ms (transform 28ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 199ms)
```

Expected result: FAIL (file does not exist).

## Passing Test Run (Step 4)

```
 RUN  v2.1.9 C:/Users/games/Desktop/hml-worktrees/setter-suite/command-center/app

 ✓ functions/lib/setterMetrics.test.ts (7 tests) 3ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  14:23:29
   Duration  443ms (transform 28ms, setup 0ms, collect 29ms, tests 3ms, environment 0ms, prepare 133ms)
```

Expected result: PASS (7 tests).

## Changes from Brief

None. Both the test file and implementation file were written exactly as specified in the brief. No bugs were found in the provided implementation.

## Implementation Summary

The module provides two pure functions for the Setter Suite:

1. **`rollUpByContact(dials: DialRow[])`**
   - Aggregates dial records by contact ID
   - Counts total attempts per contact
   - Tracks the earliest dial timestamp (first contact attempt)
   - Marks a contact as "contacted" if any dial had `spoke: true`
   - Records the outcome of the most recent dial by timestamp (not array order)
   - Handles unsorted input correctly by tracking latest timestamp separately

2. **`computeRates(leads, rollUps, appointments)`**
   - Computes headline metrics for the Setter Suite dashboard
   - Calculates `contactRate` as a percentage of leads that were contacted
   - Calculates `bookingRate` as a percentage of leads that have appointments
   - Returns `null` for `showRate` and `closeRate` (typed as literal `null` to prevent accidental faking)
   - Handles empty lead set by returning `null` rates instead of `NaN`

Both functions are pure derivations with no external dependencies, database calls, or network I/O, making them ideal for testing and auditing.

## Test Coverage

All 7 tests pass:
- `rollUpByContact` counts attempts correctly (1 test)
- `rollUpByContact` marks contacted status correctly (1 test)
- `rollUpByContact` uses latest timestamp for outcome, not array order (1 test)
- `rollUpByContact` keeps contacts separate (1 test)
- `computeRates` handles empty lead set (1 test)
- `computeRates` counts contacted leads correctly (1 test)
- `computeRates` never computes show or close rates (1 test)

## Concerns

None. Implementation follows TDD strictly, all tests pass, and no deviations from the specification were necessary.

## Fix pass 1

Addressed two code-review findings on `setterMetrics.ts`.

### What changed

**Finding 1 (Important): string comparison of `dialed_at` is not chronologically safe.**

`rollUpByContact` compared `dialed_at` as raw ISO strings for both the earliest-dial (`firstDialedAt`) and latest-dial (`lastOutcome`) logic. Lexicographic string compare only tracks real chronological order when every timestamp uses the same UTC offset representation, and there is no guarantee of that from a Postgres `timestamptz` via Supabase.

Fixed by adding a local `epochOf(iso: string): number` helper (`Date.parse`) and comparing parsed epoch milliseconds instead of strings, while still storing and returning the original ISO string in `firstDialedAt` per the type contract. Added a comment (matching the style of `adTrackerMetrics.ts` lines 182-187) explaining why that file's string-slice trick is safe for date-only buckets but not applicable here, where instant-level ordering is required.

Guard for unparseable/empty timestamps: `Date.parse` returns `NaN` for those. Decision: an unparseable timestamp is still recorded (attempts counted, and used as a fallback `firstDialedAt`/`lastOutcome` if it is literally the only data for that contact) but it can never out-rank a real, parseable timestamp when deciding first/last, since there is no way to know where in time it actually belongs. Concretely:
- If the current best (first or latest) is still unset, or is itself unparseable, and the new row is unparseable too, it does not overwrite in a chronologically meaningful way (first pass just seeds; later unparseable rows are neither provably earlier nor later, so they are ignored).
- A parseable timestamp always wins over an already-stored unparseable one, regardless of array order.

**Finding 2 (Minor): `bookingRate` never asserted against a non-trivial value.**

`computeRates`'s `bookingRate` had no test pinning it to an actual fraction, and no test proving the denominator is `leads.length` rather than `appointments.length`. No implementation bug was found here; `computeRates` already computed `bookedLeads / total` with `total = leads.length` correctly. Added test coverage only, per the finding's instructions (this is a coverage gap, not a defect).

### Tests added (`setterMetrics.test.ts`)

`rollUpByContact`:
- `"orders by real instant, not string, across mixed UTC-offset representations"`: two dials for one contact, `"2026-07-20T23:00:00-04:00"` (= `2026-07-21T03:00:00Z`) and `"2026-07-21T00:30:00Z"`. The first string-sorts earlier but is chronologically later. Asserts `firstDialedAt` is the true earlier instant and `lastOutcome` comes from the true later instant.
- `"treats an unparseable dialed_at as attempted but does not let it win ordering over a real timestamp"`: one unparseable (`"not-a-date"`) row followed by one valid row. Asserts attempts still counts both, but the valid timestamp wins for both `firstDialedAt` and `lastOutcome`.
- `"falls back to the raw value when no dial for a contact has a parseable timestamp"`: single row with `dialed_at: ""`. Asserts it does not crash and returns the raw empty string rather than `null`, since attempts occurred.

`computeRates`:
- `"pins bookingRate to a real fraction of leads booked"`: 3 leads, 1 appointment matching one of them → `bookingRate` is `1/3`.
- `"uses lead count as the bookingRate denominator, not appointment count"`: 1 lead, 3 appointments (only one of which matches a lead, trivially, since there's only 1 lead and it's in the appointments) → `bookingRate` is `1`, not `1/3`, proving the denominator is lead count.
- `"does not let an appointment for a non-lead contact inflate bookingRate"`: 2 leads, appointments include one matching lead plus one for a contact that is not a lead at all → `bookingRate` is `0.5`, proving the non-lead appointment does not get counted.

### Commands run

```bash
cd command-center/app
npx vitest run functions/lib/setterMetrics.test.ts   # before fix (tests added, implementation untouched)
# implementation fix applied
npx vitest run functions/lib/setterMetrics.test.ts   # after fix
npx tsc --noEmit -p functions/tsconfig.json
```

### Failing run (tests added, before implementation fix)

```
 RUN  v2.1.9 C:/Users/games/Desktop/hml-worktrees/setter-suite/command-center/app

 ❯ functions/lib/setterMetrics.test.ts (13 tests | 2 failed) 12ms
   × rollUpByContact > orders by real instant, not string, across mixed UTC-offset representations 7ms
     → expected '2026-07-20T23:00:00-04:00' to be '2026-07-21T00:30:00Z' // Object.is equality
   × rollUpByContact > treats an unparseable dialed_at as attempted but does not let it win ordering over a real timestamp 1ms
     → expected 'no_answer' to be 'booked' // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  functions/lib/setterMetrics.test.ts > rollUpByContact > orders by real instant, not string, across mixed UTC-offset representations
AssertionError: expected '2026-07-20T23:00:00-04:00' to be '2026-07-21T00:30:00Z' // Object.is equality

Expected: "2026-07-21T00:30:00Z"
Received: "2026-07-20T23:00:00-04:00"

 ❯ functions/lib/setterMetrics.test.ts:52:40
    50|       dial("c1", "2026-07-21T00:30:00Z", true, "booked"),
    51|     ]);
    52|     expect(r.get("c1")!.firstDialedAt).toBe("2026-07-21T00:30:00Z");
    53|     expect(r.get("c1")!.lastOutcome).toBe("no_answer");
    54|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  functions/lib/setterMetrics.test.ts > rollUpByContact > treats an unparseable dialed_at as attempted but does not let it win ordering over a real timestamp
AssertionError: expected 'no_answer' to be 'booked' // Object.is equality

Expected: "booked"
Received: "no_answer"

 ❯ functions/lib/setterMetrics.test.ts:63:38
    61|     expect(r.get("c1")!.attempts).toBe(2);
    62|     expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
    63|     expect(r.get("c1")!.lastOutcome).toBe("booked");
    64|   });
    65|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  1 failed (1)
      Tests  2 failed | 11 passed (13)
   Start at  14:31:17
   Duration  525ms (transform 70ms, setup 0ms, collect 43ms, tests 12ms, environment 0ms, prepare 191ms)
```

Note: the 3 new `bookingRate` tests and the empty-`dialed_at` fallback test were part of these same 13 and already passed here, confirming Finding 2 was a coverage gap rather than a live bug.

### Passing run (after implementation fix)

```
 RUN  v2.1.9 C:/Users/games/Desktop/hml-worktrees/setter-suite/command-center/app

 ✓ functions/lib/setterMetrics.test.ts (13 tests) 4ms

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Start at  14:31:39
   Duration  449ms (transform 33ms, setup 0ms, collect 35ms, tests 4ms, environment 0ms, prepare 134ms)
```

### tsc check

```bash
npx tsc --noEmit -p functions/tsconfig.json
```
Exit code 0, no output. `showRate` and `closeRate` remain the literal `null` type; `DialRow`, `ContactRollUp`, and `Rates` shapes and all exported function signatures are unchanged.

### Concerns

None. No em dashes used anywhere in code, comments, or this report.
