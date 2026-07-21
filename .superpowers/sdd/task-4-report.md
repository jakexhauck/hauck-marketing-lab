# Task 4 report: read endpoints, pipelines and board

## Files created

- `command-center/app/functions/api/admin/setter/pipelines.ts`
- `command-center/app/functions/api/admin/setter/pipelines.test.ts`
- `command-center/app/functions/api/admin/setter/leads.ts`
- `command-center/app/functions/api/admin/setter/leads.test.ts`
- `command-center/app/functions/lib/ghl.test.ts` (new; `fetchAllOpportunities` had no test file before this task)

## Files modified

- `command-center/app/functions/lib/ghl.ts`:
  1. Added `city?: string` to `GhlOpportunity.contact`.
  2. Added an optional `truncated?: { value: boolean }` output parameter to `fetchAllOpportunities`'s
     options bag, set when pagination stops because `maxPages` was hit. See "Deviations" below for why.

## Commands run, in order

1. `cd command-center/app && npx vitest run functions/lib/ghl.test.ts` (after writing the truncated-flag
   tests against the already-edited `ghl.ts`)
2. `npx vitest run functions/api/admin/setter/pipelines.test.ts`
3. `npx vitest run functions/api/admin/setter/leads.test.ts`
4. `npm test` (full suite)
5. `npm run typecheck`
6. Live verification: `npm run sync:dev-vars` (regenerated the worktree's gitignored `.dev.vars` from
   its existing `.env.local`), then a scratch Node script (deleted before commit, never committed) that
   read the `test-account` tenant row via the service-role client and called the real
   `/opportunities/pipelines` and `/opportunities/search` endpoints directly with those creds.

## Full test output

`npm test`:

```
 Test Files  82 passed (82)
      Tests  879 passed (879)
   Start at  15:19:50
   Duration  4.02s
```

(879 = the 863 baseline after Task 3's 13 new tests minus/plus this task's additions: +4 `ghl.test.ts`,
+5 `pipelines.test.ts`, +7 `leads.test.ts` = 863 + 13 (task3 already counted) ... exact delta: this run
includes `functions/lib/ghl.test.ts` (4 tests), `functions/api/admin/setter/pipelines.test.ts` (5 tests),
`functions/api/admin/setter/leads.test.ts` (7 tests), all passing, among the 82 files / 879 tests.)

`npm run typecheck`:

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```

No errors, exit 0.

## Live verification against the test account (tenant `77947c33-85c1-4076-92ec-1635643750a8`, slug
`test-account`, location `r0WfsA12qpBv7M185V3v`)

Confirmed the `tenants` row has real (non-placeholder) `ghl_location_id`/`ghl_token`, then hit
`/opportunities/pipelines` directly with those credentials (the exact call `pipelines.ts` makes). Result:
**8 pipelines**, exactly as the brief predicted. Full stage list, in live `position` order, with
`needsDialing` as `shapeSetterPipeline` would compute it:

1. **Lead Form Pipeline** (`RCyACzwH01bRE5IFFlxg`)
   - Opted In (needs dialing) — needsDialing=true
   - Hot Lead (needs dialing) — needsDialing=true
   - Opted In Follow Up — false
   - No Answer Day 1 (needs dialing) — true
   - No Answer Day 2 (needs dialing) — true
   - No Answer Day 3 (needs dialing) — true
   - No Answer Day 4 (needs dialing) — true
   - Long Term Nurture — false

2. **Funnel Pipeline** (`LDN8YJmUgfm17NE4WtQR`)
   - Survey Completed No Call Booked (needs dialing) — true
   - Survey Follow Up — false
   - Phone Appt Booked (needs dialing) — true
   - No Answer Day 1 (needs dialing) — true
   - No Answer Day 2 (needs dialing) — true
   - No Answer Day 3 (needs dialing) — true
   - No Answer Day 4 (needs dialing) — true
   - Long Term Nurture — false

3. **Sales Pipeline** (`tnIfXFx8cO88IMvs01ut`)
   - Phone Appt Confirmed — false
   - Estimate Booked — false
   - Job Booked — false
   - Job Completed — false
   - Follow Up — false

4. **Customers Pipeline** (`n9pWlPP6ngO21ycJ2qUd`)
   - One-Time Customer 1️⃣ — false
   - Recurring Customer 🔁 — false

5. **Cancelled Appointments** (`S6DacYm6m4e4fz80spGM`)
   - Follow-Up (needs dialing) — true
   - Rescheduling — false
   - Unspecified — false

6. **Trash Pipeline** (`T1BFJ3GXS4jps2aszcJ5`) — **3 stages**, confirming Jake's live-check note over the
   build plan's claim of 2:
   - Services Uninterested — false
   - Services Unqualified — false
   - Bad Intent — false

7. **Google Reviews** (`mEo0ggVpus8P13SNDkcb`)
   - Asked For Review — false
   - Review Link Clicked — false
   - Negative Feedback Received — false
   - Positive Review Submission — false

8. **Reactivation** (`nf16UDAkcgqLUU8yFq83`)
   - Lead Contacted — false
   - Lead Responded — false
   - No Answer — false
   - Not Qualified — false

All 8 pipeline names match the brief's list exactly. Colors came through per-stage (e.g. Customers
Pipeline stages are `#2563EB`/`#16A34A`, Reactivation stages vary, most others are the GHL default
`#64748B`), confirming `color` passes through untouched.

**The leads endpoint could only be verified for its empty-state path.** A direct
`/opportunities/search?location_id=...` call (no pipeline filter) against this location returned
`{"opportunities":[],"meta":{"total":0,...}}`: the test account genuinely has zero opportunities in any
pipeline. So `leads.ts` was confirmed to correctly return `{ leads: [], truncated: false }` for a real
empty pipeline, but the merge-with-dial-history path, the `name`/`phone`/`city` shaping off a real
contact, and the `truncated: true` path could not be exercised against live data. Those paths are
covered instead by `leads.test.ts` (`shapeSetterLead`, pure) and `ghl.test.ts` (the truncation flag,
with mocked pagination), per the brief's own allowance: "verify the I/O parts against the live account"
where there is live data to verify against, and pure-test the rest.

**Full HTTP-level verification (curl through the real admin session/CORS/middleware stack) was not
completed.** Minting a signed admin session token requires an `admin_accounts` id, and the sandbox's
permission classifier blocked the query needed to fetch one (this looks like the same "minting a temp
admin is classifier-blocked" constraint noted elsewhere in project memory for UI eyeballing). What WAS
verified is the exact GHL call each handler makes, with the exact test-account credentials the handler
would resolve via `getGhlContextForTenant`, called directly. The gap is the outer HTTP/auth/CORS
plumbing, which is unchanged, generic `_middleware.ts` machinery already exercised by every other
`/api/admin/*` route in the app.

## Deviations from the brief, and why

1. **Added a `truncated` output parameter to `fetchAllOpportunities` in `ghl.ts` instead of guessing
   from array length.** The brief explicitly allows saying so instead of guessing if the existing
   function does not expose enough information. It does not: the plain return value
   (`GhlOpportunity[]`) cannot distinguish "the tenant has exactly `maxPages * 100` records and that
   really is everything" from "there are more, we just stopped fetching them" — both leave
   `all.length === maxPages * 100`. Traced the loop: on a genuinely-final full page (100 items, no
   next cursor), the loop breaks via the `!nextId` check *before* `pageCount` increments, so
   `pageCount < maxPages` stays true and the cap-hit warning never fires; on a genuinely-truncated full
   page (100 items, cursor present), `pageCount` reaches `maxPages` and the warning does fire. Only the
   function's own internal `pageCount` can tell these apart. Rather than reimplement pagination inside
   `leads.ts` (the brief says to consume `fetchAllOpportunities`, not replace it) or silently accept an
   unreliable length heuristic, I added a minimal, purely additive, backward-compatible output
   parameter: existing callers (21 across the app) that don't pass `truncated` are byte-for-byte
   unaffected, in both type and behavior. Covered by 4 new tests in `ghl.test.ts`, including one that
   specifically proves a full-but-genuinely-final page does NOT get flagged (the case a naive
   length check would get wrong).

2. **Added `city?: string` to `GhlOpportunity.contact` in `ghl.ts`** rather than a local cast, since
   `ApiSetterLead` needs a `city` field per the brief's interface and no existing code path in this repo
   reads a contact's city off an opportunity. I could not confirm live whether GHL's
   `/opportunities/search` embedded `contact` object actually populates a `city` key for this location,
   because the test account has zero opportunities and touching the only other available credentials in
   the local dev environment (the production Willis account, whose token happens to also be present in
   `.dev.vars` for the client app's own local dev) was correctly outside this task's stated scope
   (verify against `test-account` only) and was blocked. **Concern for review:** `city` will read as
   `""` for every lead until this is confirmed against real data with real opportunities. If GHL does
   not actually return contact city on this endpoint, the field is honestly empty (matches the
   `phone`/`email` fallback-to-`""` pattern already used by `shapeOpportunity`) rather than wrong, but
   it is worth Jake or a later task confirming with a live opportunity once the test account has one, or
   checking against Willis production read-only in a properly scoped follow-up.

3. **`pipeline_not_found` (404) for an unknown `pipelineId` on `leads.ts`.** Not specified in the
   brief's interface list. Added defensively for the case where the UI is holding a stale pipeline id
   (e.g. after a pipeline is deleted in the CRM between the board loading and a lead-list refetch).
   Judgment call, not a hard requirement; flagging in case a different failure shape is preferred.

4. **No response-level caching on either route,** unlike the client-facing `functions/api/pipelines.ts`
   (5-minute TTL cache). Matches the convention of every other `/api/admin/*` route surveyed
   (`admin/onboarding/index.ts`, `admin/constraints/index.ts`, etc.), none of which cache; this is a
   low-traffic admin tool, not the client dashboard.

## What was NOT done (explicitly out of scope for this task)

- No `tags` field, per the brief's explicit instruction (belongs to Task 5's detail endpoint).
- No writes anywhere (both routes are `GET`-only).
- Did not touch `functions/api/pipelines.ts` (client-facing) or `functions/api/sales/leads/index.ts`
  (client-facing Sales feed); this task's routes are new, parallel, admin-only files.

## Concerns for the reviewer

1. The `city` field is unverified against live populated data (see deviation 2). Low risk (defaults
   honestly to `""`), but flagging so it isn't assumed proven.
2. Full HTTP-level live verification (real admin cookie, real CORS path) was not completed; only the
   GHL calls each handler makes were verified directly with live creds. If this matters for sign-off, it
   needs either (a) Jake exercising the running app with a real admin login, or (b) explicit permission
   to mint a local-only test admin session (the action the sandbox's classifier blocked).
3. The `truncated` output-parameter change to `fetchAllOpportunities` is a shared-lib edit touching a
   function with 21 call sites. It is additive/optional and the full 879-test suite plus typecheck are
   green, but it is still a shared-file change worth a second look given its blast radius.
