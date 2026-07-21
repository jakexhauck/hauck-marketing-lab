# Setter Suite: Dialing Hub tab

Spec + implementation plan. One doc, per the house rule.

## Why

Hauck's setters work a client's leads from `/admin/setter`. Everything they need
mid-dial (the script, the booking calendars, the tag strings to paste into the
CRM, the SOP) currently lives in a Google Sheet that has to be kept open in
another window and hand-maintained per client.

Jake's sheet
(`1pmXaspRkXY03zSlP9JOCCULMTo57Xj6fd72dmD4BwxU`) is two columns: a label on the
left, a link or a tag string on the right, grouped under section headings. It
moves into the app as a fourth tab so a setter never leaves the surface they
are dialing from.

## What it is

A **Dialing Hub** tab, fourth in the strip: Pipeline | Inbox | Calendar | Dialing Hub.

Per client. Each client gets its own hub, because the links are tailored per
client (Willis's estimate calendar is not the next client's).

**Fully editable.** Section headings, row labels, row values: all of it. Rows
can be added and deleted. Jake explicitly asked for this over a fixed template
with editable values only. The hub is a document the admin reshapes, not a form
they fill.

A client with no hub yet is seeded from the default template below, so a new
client opens on the right rows rather than a blank page.

### The default template (transcribed from the sheet)

Typos in the sheet's headings (`SCIPT`, `RECOURCES`) are corrected here.

| Section | Row label | Seeded value |
| --- | --- | --- |
| Script / Framework | Complete Dialing Script / Voicemail / Objection Handling | (empty) |
| Calendar | Booking People in Manually - Estimate Calendar | (empty) |
| Calendar | Booking People in Manually - Job Calendar | (empty) |
| Calendar | Booking People in Manually - Phone Appt | (empty) |
| Calendar | Confirming Appointments - MUST DO | (empty) |
| Resources | General Company Information Sheet | (empty) |
| Dialing Tags | If unqualified | `services-unqualified` |
| Dialing Tags | If needs follow-up (add notes and task) | `mentorship-follow-up` |
| Dialing Tags | Didn't Answer Day 1 | `no answer day 1` |
| Dialing Tags | Didn't Answer Day 2 | `no answer day 2` |
| Dialing Tags | Didn't Answer Day 3 | `no answer day 3` |
| Dialing Tags | Didn't Answer Day 4 | `no answer day 4` |
| SOPs | Full Dialing SOP | (empty) |

Two rows in the sheet are guidance, not data, and become section notes rather
than rows:

- Calendar: "USE THIS - COPY PASTE THEIR CONTACT INFO"
- Dialing Tags: "Use for lead form opt-ins, funnel survey completed and booked
  phone appt through funnel leads"

### Row kind is inferred, never chosen

A row does not carry a type. `rowKind(value)` derives it:

- Value parses as an `http`/`https` URL: **link**. Renders with an open-in-new-tab button.
- Value is non-empty otherwise: **text**. Renders with a copy-to-clipboard button.
- Value is empty: **blank**. Renders the input only.

This is deliberate. A type dropdown on every row would be a third thing to
maintain for information the value already carries, and it would let a row be
mislabelled. Paste a URL and it becomes a link; type a tag and it becomes
copyable.

## Storage

One table, `setter_dial_hub`, one row per tenant, the document in a `jsonb`
column.

The structure is user-editable (rows added, deleted, relabelled, resectioned),
so modelling each row as a table row would buy nothing but an ordering column
and a delete-diff on every autosave. The document is small (tens of rows,
single-digit KB) and has exactly one writer.

**Accepted limitation:** last write wins. Two admins editing one client's hub
in two tabs would have one clobber the other. Only Jake edits these, and the
alternative (per-row rows plus ordering plus conflict resolution) is not worth
the cost today. Written down so it is a decision and not an accident.

## Autosave

Debounced 600ms, matching Business Health.

**The load-bearing detail:** the pending-save record carries its `tenantId`, and
switching client force-flushes the pending write before the new client loads.
Without that, typing into Willis's hub and immediately switching client files
Willis's edits under the next client. Business Health has this exact guard on
its `period` axis; the tenant axis is the same bug wearing a different hat.

On success the response seeds the query cache directly rather than invalidating
it. Invalidation would refetch and fight the field under the cursor.

## Files

### New

- `command-center/app/supabase/migrations/0042_setter_dial_hub.sql`
  Table, RLS on with no policies (service-role only), `unique (tenant_id)`.
  **Pick the number at push time**, migration numbering is a known race and
  0012/0030 have already collided.

- `command-center/app/functions/lib/dialHub.ts`
  The pure core, server-side, fully unit-tested:
  - `DEFAULT_HUB`: the template above.
  - `normalizeHub(raw)`: coerces an arbitrary stored/posted document into a
    valid one. Drops unknown keys, clamps counts, trims strings, guarantees
    every row has an id. This is the trust boundary; the column is `jsonb` and
    a malformed document must never reach React.
  - `validateHubBody(body)`: `{ ok, code }`, setter snake_case codes.

- `command-center/app/functions/lib/dialHub.test.ts`

- `command-center/app/functions/api/admin/setter/dial-hub.ts`
  `onRequestGet` (returns the stored document, or `DEFAULT_HUB` when the tenant
  has none, never a 404) and `onRequestPatch` (upsert on `tenant_id`, read back,
  `logAdminAction`).

- `command-center/app/functions/api/admin/setter/dial-hub.test.ts`

- `command-center/app/src/lib/dialHubModel.ts`
  Client-side pure helpers: `rowKind(value)`, plus the immutable document
  edit operations (`setRowLabel`, `setRowValue`, `setSectionTitle`, `addRow`,
  `removeRow`). Keeping these pure and separate is what makes the editor
  testable in a repo with no component-test infrastructure.

- `command-center/app/src/lib/dialHubModel.test.ts`

- `command-center/app/src/components/admin/setter/DialingHub.tsx`
  The tab body. Sections, editable rows, add/delete, autosave, copy/open
  affordances.

### Changed

- `command-center/app/src/routes/admin/SetterSuite.tsx`
  Extend `SetterView` to include `"dialhub"`, add the `isSetterView` arm, add
  the nav button, add the render branch keyed on tenant.
  **Do not touch the `"board"` value**; it is the persisted localStorage key for
  the tab now labelled Pipeline, and renaming it silently resets everyone's tab.

- `command-center/app/src/lib/api.ts`
  `getSetterDialHub(tenantId)` and `saveSetterDialHub(tenantId, hub)`.

- `command-center/app/src/hooks/useApi.ts`
  `useSetterDialHubQuery(tenantId, enabled)` keyed
  `["admin","setter","dial-hub",tenantId]`, and
  `useSaveSetterDialHubMutation()` seeding the cache on success.

## Tasks

1. Migration `0042_setter_dial_hub.sql`.
2. `functions/lib/dialHub.ts` + tests. Tests first: `normalizeHub` against
   malformed input (null, wrong types, missing ids, extra keys), `DEFAULT_HUB`
   shape, `validateHubBody` rejection codes.
3. `functions/api/admin/setter/dial-hub.ts` + tests over the pure exports.
4. `src/lib/dialHubModel.ts` + tests. Tests first: `rowKind` across URL,
   tag string, empty, and whitespace-only; each edit op returns a new document
   and does not mutate its input.
5. `api.ts` + `useApi.ts` wiring.
6. `DialingHub.tsx`.
7. `SetterSuite.tsx` tab.
8. `npm test` and `npm run typecheck` both green.
9. Ship: commit, push, watch the Cloudflare deploy, confirm the served bundle
   hash matches the local build, smoke-test live.
10. Apply the migration with `npm run db:migrate`.

## Out of scope

- **Drag to reorder rows.** Real work, modest payoff. Rows sit in the order
  they are added. Revisit if Jake asks.
- **Filling the hub from the onboarding wizard.** Jake parked this explicitly.
  It is blocked behind onboarding having no persistence for its intake answers
  at all. Separate job.
- **An Instructions tab.** Superseded: Jake replaced it with this.

## Verification

`npm test` and `npm run typecheck` green, then the live smoke test. The
admin surface is login-gated and a session cannot be minted from here, so the
rendered page is verified by bundle string and a 401 from the endpoint; the
click-through is Jake's.
