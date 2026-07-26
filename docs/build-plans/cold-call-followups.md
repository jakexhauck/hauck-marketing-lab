# Cold Call: what is left after the 2026-07-26 ship

Everything below is real work found during, or created by, the ship of
`0596a24`. Spec and plan in one doc. Ordered by what hurts, not by what is
interesting.

Context: Cold Call is now one page per stage of the Cold Calling pipeline, the
lead book's status vocabulary IS that pipeline (migrations 0055, 0056), and the
import wizard pushes every row into GoHighLevel tagged `cc new lead`.

---

## P0-1. An unknown status still white-screens the page

**The defect.** Three places read `STATUS_META[lead.status].swatch` with no
guard:

- `ColdCallManage.tsx:303` and `:304`
- `CallWorkspace.tsx:218`

`STATUS_META` is keyed by the six stage names. Any lead whose status is not one
of them returns `undefined`, and the whole page dies on `.swatch`.

**Why it matters.** This is not hypothetical: it took the app down twice on
2026-07-26, and it is the thing that made a stale cache look like a blank screen
rather than an old page. It fires whenever the vocabulary and the data disagree,
which now happens if a stage is renamed in GoHighLevel, if an old row survives a
migration, or if a future migration adds a stage before the code ships.

**The fix.** A `metaFor(status)` helper in `lib/adminLeads.ts` returning a
neutral grey fallback whose label is the raw status. Three call sites use it.
An unknown stage then renders as a plain pill saying what it actually is, which
is also how someone notices the drift.

**Done when.** A lead with a junk status renders a grey pill and the page still
works. Unit test in `adminLeads.test.ts` covering the fallback.

---

## P0-2. The app cannot recover itself from a bad bundle

**The defect.** `ServiceWorkerUpdater` (in `App.tsx`) exists to force
`registration.update()` and reload when a new deploy claims the page. It lives
inside the React tree. When the running bundle throws during mount, React
renders nothing, the updater never mounts, and the tab is stuck on the broken
version until somebody opens DevTools.

That is precisely what happened on the production check after this ship: `#root`
empty, one service worker, two caches, no way out from inside the app.

**The fix, two parts.**

1. Move the update check out of React, into `main.tsx`, before `createRoot`. It
   is a browser concern, not a component concern, and it must run even when the
   app cannot.
2. A root error boundary whose fallback is a real recovery screen: one button
   that unregisters the service worker, deletes the caches, clears the
   persisted query cache and reloads. The steps we keep pasting into the console
   by hand, given to whoever is looking at the screen.

**Done when.** Deliberately throwing in a route renders the recovery screen, and
the button restores a working app in one click. Verified on a real deploy, not
just locally.

---

## P0-3. Demo data is live in production

44 seeded leads ("DEMO Roofers list", `[demo-seed]` notes) and an admin account
named "Demo Caller (delete me)" are in the production database and now visible
on every stage page.

**The fix.** A one-off script with a dry run that prints exactly what it will
delete (rows by source prefix `DEMO ` plus the demo admin), then deletes on
`--apply`. Their `cold_call_dials` rows go too, or the tracker keeps counting
calls nobody made.

**Blocked on Jake.** This is destructive and irreversible. Needs an explicit go,
and confirmation the demo caller account is not being used to test roles.

---

## P1-1. A failed GoHighLevel push is invisible and unrepeatable

**The defect.** `leads` has had `ghl_contact_id`, `ghl_synced_at` and `ghl_error`
since migration 0053, added for exactly this. The import path added in this ship
writes **none of them**. It counts pushes in the response, the wizard reports
"3 did not reach GoHighLevel", and then that fact is gone forever.

A prospect in the book but not in the CRM is invisible to the workflow, so
nobody ever calls them.

**The fix.**

1. `import.ts` stamps `ghl_contact_id` + `ghl_synced_at` on success, and
   `ghl_error` on failure.
2. The Assign page grows a filter chip "Not in GoHighLevel (n)" driven by
   `ghl_contact_id is null`.
3. A "Push to GoHighLevel" bulk action on the selected rows, reusing
   `pushImportedLead`.

**Done when.** Import with the CRM disconnected, reconnect, and every stranded
row can be pushed from the UI without re-importing the file.

---

## P1-2. Notes are invisible where lists are handed out

Notes became editable on the call in this ship, but the Assign table shows Name,
Phone, Status, Source and Whose list. The context that decides who should get a
list is the one column not on the page.

**The fix.** A Notes column, truncated with the full text on hover. Read-only
here; the call screen stays the place to write.

---

## P1-3. A stage that exists in GoHighLevel but not in the app has nowhere to go

The app's stage list is hard-coded (`coldCallStages.ts`) while GoHighLevel is
free to change. Add a stage over there and its leads land in a stage the console
cannot render; this is live right now for **Brushed Off** until Jake deletes it.

**The fix.** Fold into P0-1: an unknown status renders honestly. Then a small
Settings panel listing live GHL stages beside the app's, flagging any that
differ, so drift is visible instead of being discovered by a crash.

---

## P2, in rough order

- **Per-call notes.** `cold_call_dials.note` is accepted by the API and sent by
  nothing. A one-line note per outcome would give a call history rather than one
  overwritten paragraph per prospect.
- **A live board view.** The Pipelines page was removed when the stage pages
  replaced it, so nothing in the console now shows the real GoHighLevel boards.
  Worth restoring as a read-only page if you ever want to see the CRM's own
  truth.
- **Component tests.** Both white screens this month were component-level, and
  this repo has no component test infrastructure, so neither was catchable by
  the suite. `@testing-library/react` plus tests for the three surfaces that
  render a status would have caught P0-1 before it shipped, twice.

---

## For Jake

1. **Delete the Brushed Off stage and its `cc brush off` automation** in
   GoHighLevel. The app no longer has that stage.
2. **Tell anyone with the app open to hard-refresh once.** Their service worker
   is still serving the pre-ship bundle, which crashes against the migrated
   database. P0-2 makes this self-healing; until then it is manual.
3. **Decide on the demo data** (P0-3).
4. **Decide what a re-import should do.** Today a phone already in the book is
   skipped entirely, so an old prospect is never re-tagged and never re-enters
   the board. That is right for a duplicate file and wrong for deliberately
   re-working a list.
