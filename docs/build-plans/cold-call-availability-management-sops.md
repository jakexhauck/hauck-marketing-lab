# Cold Call: Availability, Management, SOPs. Spec + Shipped Record

> **Status: SHIPPED 2026-07-27.** This is the record for work already live, not a
> plan to execute. It exists because the console now has more than one person in
> it and every shipped surface needs to be accounted for. Do not implement from
> it; read it to understand why the surfaces are shaped the way they are.

**Commits:** `89918b8` availability, `7b4a55c` Management + release notes,
`a1714a7` SOPs, `2c77c40` SOPs as a document. Merged to main across `7daab02`,
`6b915aa`, `83a5875`.

**Migrations:** `0057_cold_call_availability.sql`, `0061_cold_call_sops.sql`.

**Goal:** Give a hired cold caller the two things a hire needs that an owner
never did: a way to say when they are working, and a place to read how the job
is done. Give the owner one tab to run the operation from instead of a strip
that grows an entry per lever.

---

## Global constraints

- **Never use an em dash** in code, comments, copy or UI text.
- **Never name GoHighLevel in client-facing UI.** These surfaces are admin-only,
  so internal labels are fine.
- The app never writes a pipeline stage. Unchanged by this work.
- Every surface here is reached under `/admin/pillar/acquisition?tab=cold-call`.

---

# Part 1: What shipped

## 1.1 Availability (`?view=availability`)

A week grid a caller paints to say when they are on the phones. Monday to
Sunday across, 08:00 to 20:00 down, in half-hour cells. Drag to paint, drag back
across a painted range to clear. Saves per day on pointer release.

Left side of the strip, so a cold caller sees it. An owner gets the section's
person selector and can view or set anyone's week.

**Storage:** one row per person per day, holding that day's half-hour slot
indices as a `smallint[]`.

- Slot = 30-minute index from local midnight. 0 = 00:00, 16 = 08:00, 47 = 23:30.
- The rendered 08:00-20:00 window is a UI decision, not a stored one, so
  widening the grid needs no migration and rewrites no rows.
- An empty array is a real answer ("asked, and not available"). The row is kept
  rather than deleted so it stays distinguishable from a day nobody filled in.

**Why an array and not a row per slot:** a day is edited as a whole when a range
is painted, and the Supabase REST client has no transaction. A delete-then-insert
of twenty rows can leave a half-erased day behind if the second call fails. One
upsert means a day is either the old shape or the new one, never a torn mixture.

## 1.2 Management (`?view=management`)

One owner-only tab holding five pages in `?manage=`:

| Page | What it is |
|---|---|
| `assign` | Handing leads out. Was its own strip tab. |
| `availability` | The roster's week, read only. |
| `scripts` | The pitch variations and their numbers. Was Settings. |
| `assets` | The mid-call shelf. Was Settings. |
| `sops` | Writing the SOPs the team reads. |
| `stages` | Whether the app and GHL still agree. Was Settings. |

**Settings was removed as a tab.** The word grouped three unrelated jobs (write a
pitch, stock a shelf, verify a CRM) under a heading that described none of them,
so each is named for what it is.

**Old links still land.** `?view=assign` opens Management. `?view=settings`
opens Management on `scripts` specifically, rather than Management's own default,
because that is the page it used to show first.

**Team availability is read only, deliberately.** Editing stays where a person
paints their own week. An owner rewriting a hire's stated hours from a screen the
hire never sees is how a rota stops matching who is actually at a desk.

**"Everyone" asks for a name.** There is no honest way to merge two people's
hours into one paintable grid, so the per-person view asks the owner to pick
someone rather than inventing a combined week. Same reasoning the tracker uses.

## 1.3 SOPs (`?view=sops` to read, `?manage=sops` to write)

How the job is done. The owner writes them under Management; everyone with a
cold-calling login reads them on their own page.

A **third `kind` on `cold_call_assets`**, not a table of its own. An SOP is the
same shape as everything already there: a name, an owner-typed heading, sanitized
html, an order, an archive flag. The only difference is when it is read, and that
is not a schema difference. A parallel table would have duplicated the sanitizer,
the ordering, the archive rules and the endpoint.

`kind` now means:

- `script` a pitch variation, and the unit of the A/B test.
- `asset` read MID-call, in the floating panel.
- `sop` read BEFORE and BETWEEN calls, on its own page.

**Read as a full-width document.** A dropdown above the title picks the document,
grouped by the owner's headings; the document takes the whole column. An SOP is
read start to finish rather than scanned, so the reading surface gets the width
and navigation costs a click only when somebody wants a different document. Print
styles included, because printing an SOP is a real thing somebody does on their
first day.

**The reading side has no edit control at all.** The API refuses a non-owner
write on its own account, and a page that offers a button it will then refuse is
worse than one that never offered it.

**Deliberately NOT built on the Drive-backed SOP Hub** (`functions/api/admin/sops`).
That one reads live from Google Drive, and Drive has never been connected on this
install, so anything depending on it would have shipped unable to work.

## 1.4 Release notes and the update popup

The console has more than one person in it, so a feature that ships silently is a
feature only the person who asked for it knows about.

`src/lib/releaseNotes.ts` holds a newest-first list. `UpdateDialog` is mounted on
`AdminLayout` and shows a person what they have not seen, once. Dismissal is
stored in `localStorage`, keyed by admin id.

- **A first-time viewer sees the latest release only**, never the whole history,
  so the list can grow without walling a new hire behind a changelog.
- An unrecognised stored id (a release renamed or removed) falls back to the
  latest, so a stale value can never silence someone permanently.
- Storage reads and writes are wrapped: Safari private mode throws on write, and
  a browser that refuses to remember must still show the app.

**Standing rule:** every change to what someone can DO adds an entry in the same
commit as the feature. Not needed for refactors, silent bug fixes, or
backend-only work: the list is what changed for a person.

---

# Part 2: Security

Who a request may touch is decided **server side, never from the body**.

- A cold caller is pinned to their own id on both read and write of availability.
  A `callerId` naming a colleague is ignored rather than obeyed, so the answer is
  their own week rather than an error to probe.
- An owner may name anyone, because setting the rota is the job.
- `/api/admin/cold-call/availability` is listed EXACT in the role allowlist, so
  `/availability/team` (the roster's week) is shut to a cold caller by
  construction. The handler re-checks for owner anyway: it is the one route that
  returns a colleague's hours, so it does not depend on a single allowlist entry
  staying correct forever.
- SOP html is sanitized server side on every write, the same boundary the dialing
  script and mid-call shelf are rendered through.

---

# Part 3: What is NOT proven

- **The cold-caller role has never been exercised in production.** Zach Lewis
  (`cold_caller`, username `zach`) signed in once at 20:52 on 2026-07-27, before
  any of this existed. Nobody has confirmed from his account that Availability
  and SOPs are reachable, that Management is hidden, or that the update popup
  appears.
- No component tests. This repo has no component-test infrastructure; the pure
  logic is covered (week maths, coverage, release gating, the who-can-touch-whom
  boundary) and the rendering is not.
- The auto-reload on a new deploy (`lib/appRecovery.ts`) can interrupt someone
  mid-task. Pre-existing, but only reachable now that a second person uses the
  console. Not yet a prompt.

---

# Part 4: Gotchas found while building

- **Migration numbers race.** `0057` exists twice (`cold_call_availability` and
  `sales_calls`) because two branches picked it the same afternoon. Harmless: the
  ledger keys on filename, not number. Pick the number at PUSH time.
- `Number(null)` is `0`, which is a valid in-range slot index. A slot guard that
  coerces before type-checking silently turns junk into midnight. Caught by a test.
- A single click is pointerdown then pointerup with no guaranteed render between
  them. A paint state kept in a ref that only catches up on re-render hands the
  save the pre-click state. The ref is written synchronously for this reason.
- `origin/main` moved three times during this build (sales calls, settings
  control room, health watchdog). Fetch and reason about `origin/main` before
  every push.
