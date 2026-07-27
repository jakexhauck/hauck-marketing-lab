# Cold Call: what is left after the 2026-07-26 ship

Everything below was real work found during, or created by, the ship of
`0596a24`. Ordered by what hurt, not by what was interesting.

**Closed out 2026-07-27.** Every P0 and P1 below is done; what remains is the P2
list and the two decisions that are Jake's rather than the app's. The state of
each item is stated at the top of it.

Context: Cold Call is one page per stage of the Cold Calling pipeline, the lead
book's status vocabulary IS that pipeline (migrations 0055, 0056), the import
wizard pushes every row into GoHighLevel tagged `cc new lead`, and a booked
meeting is now tracked through to what it became (0057).

---

## P0-1. An unknown status still white-screens the page: DONE

**The defect.** Three places read `STATUS_META[lead.status].swatch` with no
guard, in `ColdCallManage.tsx` and `CallWorkspace.tsx`. `STATUS_META` is keyed by
the six stage names, so anything else returned `undefined` and the page died on
`.swatch`. It took the app down twice on 2026-07-26.

**The fix, as built.** `metaFor(status)` in `lib/adminLeads.ts` returns a neutral
grey fallback labelled with the raw status. All three call sites use it. Four
tests in `adminLeads.test.ts` cover the fallback, an empty status, and the
labelling.

An unknown stage now renders as a plain grey pill saying what it actually is,
which is also how somebody notices the drift.

---

## P0-2. The app cannot recover itself from a bad bundle: DONE

**The defect.** `ServiceWorkerUpdater` lived inside the React tree. When the
running bundle threw during mount, React rendered nothing, the updater never
mounted, and the tab was pinned to the broken version until somebody opened
DevTools.

**The fix, as built.** Two new files:

- `lib/appRecovery.ts`: `startUpdateChecks()` (the update logic, pulled out of
  React and called from `main.tsx` before `createRoot`) and `resetClient()` /
  `resetAndReload()` (unregister every worker, delete every cache, clear both
  persisted query keys, return to `/`).
- `components/RecoveryBoundary.tsx`: a root error boundary wrapping everything
  **outside** the providers, so a throw while a context is setting up is caught
  too. It styles itself inline and imports no CSS, because a bundle broken badly
  enough to land there cannot be trusted to have loaded a stylesheet.

**Verified** by throwing deliberately in a route: the recovery screen renders and
its one button restores a working app.

---

## P0-3. Demo data is live in production: DONE

44 seeded leads, 18 demo tracker days and 7 recorded dials were in the
production database and visible on every stage page. Every lead in the book was
fake.

**The fix, as built.** `scripts/purge-demo-cold-calling.mjs`: a dry run by
default that prints exactly what it would remove, deleting only on `--apply`.
Dials go before leads, deliberately: `cold_call_dials.lead_id` is `on delete set
null`, so purging the leads first would leave orphaned dials with no way left to
tell they were demo.

Run against production on 2026-07-27 with Jake's go. 44 leads, 7 dials and 18
tracker days removed. Jake's own 2 typed tracker days were untouched.

**Still Jake's, and not the app's:** the `Demo Caller (delete me)` login was
kept (pass `--caller` to remove it), and three demo contacts reached the real
GoHighLevel account and must be deleted there by hand: Tom Hale, Sofia Novak,
Rosa Petrov, all on `(555)` numbers. Deleting a contact stays a human decision
made inside GHL; see the rule at the top of `functions/lib/agencyCrm.ts`.

---

## P1-1. A failed GoHighLevel push is invisible and unrepeatable: DONE

**The defect.** `leads` has had `ghl_contact_id`, `ghl_synced_at` and `ghl_error`
since migration 0053. The import path wrote none of them. It counted pushes in
the response, the wizard reported "3 did not reach GoHighLevel", and then that
fact was gone forever.

**The fix, as built.**

1. `leads/import.ts` stamps all three columns per row. Only a clean push sets
   `ghl_synced_at`, so a half-push still reads as unfinished. "Not connected"
   is not stamped on anything: it is a state of the whole install, not a fact
   about a prospect.
2. `leads/push-ghl.ts`: a new owner-only endpoint that pushes a selection
   through the same `pushImportedLead` and stamps the same columns, capped at
   200 per request.
3. The Assign page grows a "Not in GoHighLevel (n)" filter chip on its own axis
   (it composes with the assignee filter), a "Push to GoHighLevel" bulk action,
   and a small warning dot beside any name the CRM never got, carrying the error
   on hover.

The selection is kept when some rows fail, because those are exactly the ones
worth trying again.

---

## P1-2. Notes are invisible where lists are handed out: DONE

The Assign table has a read-only Notes column, truncated with the full text on
hover. The call screen stays the place to write one.

---

## P1-3. A stage in GoHighLevel with no page in the app: DONE

Half of this folded into P0-1: an unknown status now renders honestly.

The other half is `components/admin/acquisition/StagesPanel.tsx`, on Cold Call >
Settings under the script: the app's six stages beside the live ones, each
flagged as in both / not in GoHighLevel / no page in the console. The comparison
is `lib/stageDrift.ts` (11 tests), which picks the pipeline by stage overlap
rather than by name, ignores case and spacing, and refuses to claim "in sync"
when it could not identify the board at all.

Read-only on purpose: the fix belongs in GoHighLevel, and a button here that
renamed a stage over there would be this app moving Jake's pipeline behind his
back.

As of 2026-07-27 the live Cold Calling pipeline matches all six exactly: Jake
has deleted Brushed Off.

---

## What the meeting became (0057): DONE, and new since this doc was written

Booked was the last thing the app knew. A meeting that had been and gone sat
under "Already happened" forever, so booked -> showed -> closed stopped one step
short of the number that says whether any of the dialing is worth doing.

- `supabase/migrations/0057_sales_calls.sql`: the table. It was already applied
  to production by an earlier session whose file was never committed; this is
  reconstructed from the live schema, and it additionally turns on row-level
  security, which the live table was missing (applied separately, since the
  ledger already had the migration recorded).
- `functions/lib/salesCalls.ts` (+ 14 tests): four outcomes (`closed`,
  `follow_up`, `no_show`, `not_a_fit`), the totals, and which shelf a meeting
  belongs on. A no-show is an OUTCOME, not an appointment status: the slot was
  reached and nobody came, which is a different fact from a meeting cancelled in
  advance.
- `functions/api/admin/cold-call/meetings.ts`: GET the list, PATCH one outcome.
  `showed` is never sent by the browser; it is derived from the outcome server
  side, exactly as `spoke`/`pitched` are on a dial.
- `cold-call/book.ts` now writes the meeting's row at booking time, keyed on the
  GoHighLevel appointment id so the write is repeatable.
- `ColdCallBooked.tsx`: rebuilt. Meetings whose slot has passed with nothing
  recorded lead the page, because they are the only rows that are work. The
  strip reads Booked -> showed% -> Showed -> closed% -> Closed, with the rates
  drawn as the links between the counts rather than as tiles of their own.

A meeting still to happen never drags the show rate down: the denominator is
meetings that have been decided, not meetings that exist.

---

## P2, still open, in rough order

- **Per-call notes.** `cold_call_dials.note` is accepted by the API and sent by
  nothing. A one-line note per outcome would give a call history rather than one
  overwritten paragraph per prospect.
- **A live board view.** The Pipelines page was removed when the stage pages
  replaced it, so nothing in the console shows the real GoHighLevel boards. The
  endpoint (`cold-call/pipelines.ts`) is still there and still works; only the
  page went. Worth restoring read-only if you ever want the CRM's own truth.
- **Component tests.** Both white screens this month were component-level, and
  this repo has no component test infrastructure, so neither was catchable by
  the suite. `@testing-library/react` plus tests for the surfaces that render a
  status would have caught P0-1 before it shipped, twice.
- **The rest of the sales_calls table.** `sections`, `scratchpad`, `deal`,
  `business_name` and `duration_seconds` exist in the schema and nothing writes
  them. They are the shape of a fuller call-logging cockpit that was designed
  and never built. Leave them or build it; do not half-fill them.

---

## For Jake

1. ~~Delete the Brushed Off stage and its `cc brush off` automation.~~ Done: the
   live pipeline matches the app exactly.
2. **Tell anyone with the app open to hard-refresh once**, one last time. P0-2
   makes this self-healing from the next deploy onward, but the bundle currently
   on their device predates the fix.
3. ~~Decide on the demo data.~~ Done. Two leftovers above: the demo caller login,
   and three contacts in the real GoHighLevel account.
4. **Decide what a re-import should do.** Today a phone already in the book is
   skipped entirely, so an old prospect is never re-tagged and never re-enters
   the board. That is right for a duplicate file and wrong for deliberately
   re-working a list.
5. **Write the dialing script.** Cold Call > Settings is empty, so the floating
   panel a caller opens mid-call has nothing in it.
