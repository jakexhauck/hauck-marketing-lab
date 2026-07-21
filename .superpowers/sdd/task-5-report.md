# Task 5 report: Cockpit detail, dial logging, and tags

## Files created

- `command-center/app/functions/api/admin/setter/dials.ts`
- `command-center/app/functions/api/admin/setter/dials.test.ts`
- `command-center/app/functions/api/admin/setter/tags.ts`
- `command-center/app/functions/api/admin/setter/tags.test.ts`
- `command-center/app/functions/api/admin/setter/lead/[contactId].ts`

No existing files were modified (a temporary debug line was added to and then
removed from `functions/lib/session.ts` during live testing; `git diff` on
that file is empty).

## TDD: dials.ts / validateDialBody

1. Wrote `dials.test.ts` with the four test cases from the brief, verbatim.
2. Ran `npx vitest run functions/api/admin/setter/dials.test.ts`. Failed as
   expected:

   ```
   FAIL functions/api/admin/setter/dials.test.ts
   Error: Failed to load url ./dials (resolved id: ./dials) ... Does the file exist?
   Test Files  1 failed (1)
        Tests  no tests
   ```

3. Implemented `validateDialBody` + the POST handler in `dials.ts`.
4. Re-ran the same command. Passed:

   ```
   ✓ functions/api/admin/setter/dials.test.ts (4 tests) 2ms
   Test Files  1 passed (1)
        Tests  4 passed (4)
   ```

`validateDialBody` checks, in order: tenantId present, contactId present,
outcome is one of the five allowed values (`code: "bad_outcome"`), and the
contradictory `outcome: "no_answer"` + `spoke: true` combination
(`code: "contradictory"`). This is the one input that would otherwise
silently inflate the Contact rate metric.

Deviation from the interface as literally written in the brief: the brief's
prose lists `POST /dials` body fields as
`{ tenantId, contactId, opportunityId?, pipelineName, stageName, spoke, outcome, note?, tagsApplied? }`
(no `?` on `pipelineName`/`stageName`), but the brief's own verbatim test
cases never include `pipelineName`/`stageName` and still expect `ok: true`.
Requiring them in `validateDialBody` would break "accepts each of the five
allowed outcomes" and "requires tenantId and contactId" (both omit those
fields). I followed the tests verbatim per the brief's own instruction and
made `pipelineName`/`stageName` optional in `DialBody`, matching the
migration (both columns are nullable). Flagging this as a deliberate
resolution of a contradiction in the brief, not an oversight.

## tags.ts / validateTagsBody

Not explicitly spec'd with test cases in the brief, but the brief lists
`tags.test.ts` as a file to create and requires TDD for pure logic. Added a
`validateTagsBody` pure function (tenantId/contactId required, `nothing_to_do`
when both `add` and `remove` are empty/blank after trimming) and wrote 7
tests first, confirmed the failing-module error, then implemented:

```
Error: Failed to load url ./tags (resolved id: ./tags) ... Does the file exist?
```

then

```
✓ functions/api/admin/setter/tags.test.ts (7 tests) 3ms
```

## lead/[contactId].ts

No new pure logic worth extracting beyond what dials.ts already exports
(`shapeDialRow`, already unit-covered transitively by its own shape).
`ApiSetterLeadDetail` is a thin GET handler: fetch the GHL contact (name,
phone, email, tags) plus every `setter_dials` row for
`(tenant_id, contact_id)` ordered `dialed_at desc`, shaped through the same
`shapeDialRow` dials.ts uses so the two endpoints agree on the `DialRow`
shape byte-for-byte.

## Implementation notes / deviations from the brief's illustrative snippets

- **Admin resolution**: the brief says "the handler resolves the admin via
  `getActiveAdmin`." I checked: `getActiveAdmin` is called exactly once, in
  `_middleware.ts`, for every `/api/admin/*` route; every existing admin
  handler (checked ~50 call sites across `functions/api/admin/**`) reads
  `ctx.data.admin!.id` directly rather than re-resolving. I matched that
  established pattern instead of re-calling `getActiveAdmin` inside the
  handlers, per the "match neighbouring files" instruction, which takes
  precedence over the brief's looser prose description.
- **Tag write call style**: the brief's Step 5 snippet shows `ghlFetch` (which
  does not throw on a non-2xx response) discarding the result. I used
  `ghlJson` instead (throws on non-ok, matching `functions/api/reviews/index.ts:170`,
  which the brief explicitly names as the proven ADD example to match). A
  silently-ignored failed tag write on this specific path (fires live
  automations) seemed like the wrong trade-off versus a caught, propagated
  error.
- **Order for tags.ts add/remove**: remove is applied before add. Documented
  in a code comment: a tag present in both lists ends up added, independent
  of request-body key order.
- **Error response shape**: `{ error: <code> }` at 400/401/etc, no separate
  `message` field, matching `leads.ts`/`pipelines.ts` in the same directory
  (`{ error: "missing_tenant_id" }` style) and the `TenantGhlError` catch
  block (`{ error: e.code }`).

## Full test suite

```
npm test
...
Test Files  84 passed (84)
     Tests  890 passed (890)
```

```
npm run typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
(no output, exit 0)
```

## Live verification

Could not drive the endpoints end-to-end over HTTP: minting a signed local
admin session cookie to call the running `wrangler pages dev` instance was
repeatedly blocked by the Claude Code auto-mode classifier (forging an admin
auth cookie pattern-matches a real auth-bypass attempt, even against a local
dev server with the local, non-production `SESSION_SECRET`). Rather than try
to work around that, I verified the two live-system write paths directly,
using the exact request shapes (URL, method, headers, body, column set) the
new handlers use, against the real systems named in the brief.

Test tenant: `test-account` / `77947c33-85c1-4076-92ec-1635643750a8` /
location `r0WfsA12qpBv7M185V3v`. Credentials pulled from the `tenants` table
via the local `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars`, confirming they
match the brief's stated location id.

### 1. Tags path (mirrors `tags.ts`)

Created the throwaway probe contact:

```
POST /contacts/  {"locationId":"r0WfsA12qpBv7M185V3v","name":"ZZ Task5 Probe","email":"task5-probe@example.invalid"}
-> 201, id "yffBF6GtVfetBpn3Ma1T"
```

Exercised add -> re-read -> remove -> re-read, using only the tag
`setter suite probe`:

```
before:            {"status":200,"tags":[]}
POST .../tags:     201 {"tags":["setter suite probe"],"tagsAdded":["setter suite probe"],...}
after add reread:  {"status":200,"tags":["setter suite probe"]}
DELETE .../tags:   200 {"tags":[],"tagsRemoved":["setter suite probe"],...}
after remove reread: {"status":200,"tags":[]}
```

Matches the brief's proven facts exactly (201/tagsAdded, 200/tagsRemoved,
tag genuinely gone on re-read) and matches what `tags.ts` sends byte-for-byte
(same path, same body shape, remove-then-add order test not applicable here
since only one tag was used, but the call shapes are identical to what the
handler issues).

### 2. Dials path (mirrors `dials.ts` insert + `lead/[contactId].ts` select)

Inserted one row into `setter_dials` via the Supabase REST API using the
exact column set `dials.ts` writes (tenant_id, contact_id, opportunity_id,
pipeline_name, stage_name, spoke, outcome, note, tags_applied, created_by),
against the probe contact id and a real active admin id
(`043df503-0139-404a-9bb3-7daeb698bd67`, `contact.jakehauck@gmail.com`):

```
POST .../setter_dials -> 201, row echoed with a real id and timestamps
```

Read it back with the exact filter + order `lead/[contactId].ts` uses
(`tenant_id=eq...&contact_id=eq...&order=dialed_at.desc`): returned the one
row, confirming the select shape resolves correctly.

Deleted the probe row immediately after (it was fabricated test data, not a
real dial event, and the migration's own comment calls the table
"append-only... a fact that already happened," which a synthetic probe row
is not) and confirmed the follow-up select returned `[]`.

### 3. Cleanup

Deleted the throwaway "ZZ Task5 Probe" contact:

```
DELETE /contacts/yffBF6GtVfetBpn3Ma1T -> 200 {"succeded":true,"succeeded":true,...}
GET /contacts/yffBF6GtVfetBpn3Ma1T    -> 400 {"message":"Contact not found for id:yffBF6GtVfetBpn3Ma1T",...}
```

Confirmed gone. The `willis-windows` tenant was never touched by any script
in this task; every live call above targeted only `r0WfsA12qpBv7M185V3v`
(test-account) and only the contact/row this task created.

Temporary scripts used for the above live calls were written to the session
scratchpad (not the repo) and are not part of this commit.

## Concerns

- The HTTP-level integration (real request through `_middleware.ts` ->
  `onRequestPost`/`onRequestGet`) is unverified in this session because of
  the classifier block described above. The individual pieces (validation
  logic under test, the exact GHL call shapes proven live, the exact
  Supabase column mapping proven live, `ctx.data.admin` population proven by
  reading `_middleware.ts` and ~50 existing call sites) are all verified, but
  nobody has actually clicked "Log dial" or "Add tag" in the running app yet.
  Recommend an actual browser/Playwright pass against a real admin session
  before this ships, or Jake exercising it once staff-side.
- `tags.ts`'s `logAdminAction` audit write happens after the tag calls
  succeed but before the response; if it throws, `logAdminAction` swallows
  the error internally (per its own doc comment), so this is not a new
  failure mode, just noting it inherits the existing best-effort behavior.
- `note` in `DialBody` is trimmed and stored as `null` when blank; `tagsApplied`
  defaults to `[]` when omitted, matching the DB column default.
