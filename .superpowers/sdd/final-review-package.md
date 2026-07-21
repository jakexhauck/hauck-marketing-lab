# Final whole-branch review: feat/setter-suite

## Commits
995c3c6 feat(setter): rate strip, with unavailable rates marked pending
8bd7268 fix(setter): keyboard-reachable spoke toggle, distinct detail-fetch error state
d14ee14 fix(setter): stale rail gets a text chip, drop dead needsDialing, focus ring
8024781 feat(setter): lead cockpit with dial logging, tags, and booking
1b1b49b feat(setter): pipeline board across all 8 pipelines
1774821 feat(setter): live slot lookup and booking via the existing appointments lib
3b32c9a feat(setter): lead detail, dial logging, and tag add/remove
3463889 feat(setter): read endpoints for pipelines and board leads
fb8970d feat(setter): add setter_dials, the per-dial event table
e2d9785 refactor(admin): extract getGhlContextForTenant, the missing shared helper
3079046 fix(setter-metrics): compare dial timestamps by epoch, not string
f6d79b2 feat(setter): derive per-contact roll-ups and rates from dial events
4d015eb docs(setter): spec + plan for the Setter Suite admin surface

## Stat
 .superpowers/sdd/task-7-report.md                  | 277 +++++++
 .superpowers/sdd/task-8-report.md                  | 293 +++++++
 .../api/admin/clients/[tenantId]/import-staff.ts   |  36 +-
 .../api/admin/onboarding/[tenantId]/readiness.ts   |  24 +-
 .../app/functions/api/admin/setter/book.test.ts    |  96 +++
 .../app/functions/api/admin/setter/book.ts         | 117 +++
 .../app/functions/api/admin/setter/dials.test.ts   |  28 +
 .../app/functions/api/admin/setter/dials.ts        | 154 ++++
 .../functions/api/admin/setter/lead/[contactId].ts |  82 ++
 .../app/functions/api/admin/setter/leads.test.ts   |  88 +++
 .../app/functions/api/admin/setter/leads.ts        | 127 +++
 .../functions/api/admin/setter/pipelines.test.ts   |  50 ++
 .../app/functions/api/admin/setter/pipelines.ts    |  77 ++
 .../app/functions/api/admin/setter/slots.test.ts   |  69 ++
 .../app/functions/api/admin/setter/slots.ts        |  95 +++
 .../app/functions/api/admin/setter/tags.test.ts    |  45 ++
 .../app/functions/api/admin/setter/tags.ts         | 115 +++
 command-center/app/functions/lib/ghl.test.ts       |  98 +++
 command-center/app/functions/lib/ghl.ts            |  17 +-
 .../app/functions/lib/setterMetrics.test.ts        | 117 +++
 command-center/app/functions/lib/setterMetrics.ts  |  97 +++
 command-center/app/functions/lib/tenantGhl.test.ts |  17 +
 command-center/app/functions/lib/tenantGhl.ts      |  52 ++
 command-center/app/src/App.tsx                     |  11 +
 .../app/src/components/admin/SetterRateStrip.tsx   |  41 +
 .../app/src/components/admin/setter/DialLogger.tsx | 145 ++++
 .../src/components/admin/setter/SetterBoard.tsx    | 112 +++
 .../app/src/components/admin/setter/SetterCard.tsx |  73 ++
 .../src/components/admin/setter/SetterCockpit.tsx  | 200 +++++
 .../app/src/components/admin/setter/SlotPicker.tsx | 225 ++++++
 .../app/src/components/admin/setter/TagField.tsx   | 153 ++++
 command-center/app/src/hooks/useApi.ts             | 239 ++++++
 command-center/app/src/lib/api.ts                  |  76 ++
 command-center/app/src/lib/setterCockpit.test.ts   | 239 ++++++
 command-center/app/src/lib/setterCockpit.ts        | 147 ++++
 command-center/app/src/lib/setterModel.test.ts     | 117 +++
 command-center/app/src/lib/setterModel.ts          |  69 ++
 command-center/app/src/lib/setterRates.test.ts     |  92 +++
 command-center/app/src/lib/setterRates.ts          |  99 +++
 .../app/src/routes/admin/AdminLayout.tsx           |   5 +-
 .../app/src/routes/admin/SetterSuite.tsx           | 150 ++++
 .../app/supabase/migrations/0040_setter_dials.sql  |  47 ++
 docs/build-plans/setter-suite.md                   | 849 +++++++++++++++++++++
 43 files changed, 5225 insertions(+), 35 deletions(-)

## Full diff
```diff
diff --git a/.superpowers/sdd/task-7-report.md b/.superpowers/sdd/task-7-report.md
new file mode 100644
index 0000000..4f6e2fb
--- /dev/null
+++ b/.superpowers/sdd/task-7-report.md
@@ -0,0 +1,277 @@
+# Task 7 report: the board
+
+## Files created
+
+- `command-center/app/src/lib/setterModel.ts` — pure model helpers: `needsDialing`,
+  `isStaleUncontacted`, `cardRail`, `formatOutcome`. No I/O.
+- `command-center/app/src/lib/setterModel.test.ts` — 11 tests (the given `needsDialing`
+  suite verbatim, plus `isStaleUncontacted`, `cardRail`, `formatOutcome`).
+- `command-center/app/src/components/admin/setter/SetterCard.tsx` — one board card.
+- `command-center/app/src/components/admin/setter/SetterBoard.tsx` — one pipeline's
+  stage columns.
+- `command-center/app/src/routes/admin/SetterSuite.tsx` — the page shell (`/admin/setter`):
+  client picker, pipeline tabs, board.
+
+## Files modified
+
+- `command-center/app/src/App.tsx` — imports `SetterSuite`, registers
+  `<Route path="/admin/setter" element={<AdminRoute><SetterSuite /></AdminRoute>} />`.
+- `command-center/app/src/routes/admin/AdminLayout.tsx` — `SPINE_NAV`'s "Sales" entry now
+  points at `/admin/setter` instead of `/admin/pillar/sales`. The old Sales Data pillar tab
+  is untouched and still reachable by direct URL; only the spine icon was re-pointed, per
+  the plan's literal instruction ("point the Sales spine slot at it").
+- `command-center/app/src/lib/api.ts` — added `ApiSetterStage`, `ApiSetterPipeline`,
+  `ApiSetterLead`, `ApiSetterLeadsResponse` (wire types mirroring the two GET endpoints
+  exactly, not touched otherwise).
+- `command-center/app/src/hooks/useApi.ts` — added `useSetterPipelinesQuery(tenantId, enabled)`
+  and `useSetterLeadsQuery(tenantId, pipelineId, enabled)`, following the existing
+  `useAdminClientsQuery` pattern (staleTime, queryKey shape).
+
+**Deviation from the brief's file list:** the brief's Task 7 file list names only
+`src/App.tsx` and `src/routes/admin/AdminLayout.tsx` as modifications. I also touched
+`src/lib/api.ts` and `src/hooks/useApi.ts` to add the wire types and TanStack Query hooks
+for the two setter GET endpoints. This was necessary (the board has to fetch its data
+somehow) and follows the codebase's existing convention exactly (every other admin
+surface's types live in `api.ts` and its query hooks live in `useApi.ts`; nothing calls
+`fetch`/`api()` directly from a route component elsewhere in admin). Flagging it since it
+wasn't in the brief's literal list.
+
+## Design decisions / deviations worth flagging
+
+1. **No "source chip" on the card.** The brief text (and the plan) both say the card
+   should show "a source chip." The real `ApiSetterLead` shape (confirmed by reading
+   `functions/api/admin/setter/leads.ts`, the actual implementation, not just the summary
+   in the task prompt) has no source/attribution field: `id, contactId, name, phone, city,
+   stageName, createdAt, attempts, firstDialedAt, contacted, lastOutcome`. The mockup's
+   "source chip" ("Facebook Ads", "Lead Form", etc.) was randomly generated fixture data,
+   not something the real endpoint returns. Fetching attribution/tags per card would be
+   exactly the N+1 the endpoint's own comment says was deliberately avoided. Rather than
+   fabricate a source, the card instead shows a **last-outcome chip** (`formatOutcome`,
+   title-cased from the `setter_dials` enum) when `lastOutcome` is set, since that's real
+   data and useful to a setter. Also added a "Spoke" chip when `contacted` is true. Please
+   confirm this reads right, or say if you'd rather the chip slot stay empty until an
+   attribution field exists on the endpoint.
+2. **Grouping cards by `stageName`, not stage id.** `ApiSetterLead` only carries
+   `stageName` (already resolved server-side against live GHL stage names), not a stage
+   id. `SetterBoard` groups leads into columns by exact stage-name match against
+   `pipeline.stages[].name`. A lead whose name doesn't match any current column (a stale
+   fetch, a stage renamed mid-session) is silently dropped from the board rather than
+   crashing it or inventing a stray column; that column's own count elsewhere stays correct.
+3. **No per-pipeline lead counts on the tabs.** The mockup shows a count badge per pipeline
+   tab. Getting real counts for all 8 tabs up front would mean firing all 8 leads requests
+   before the admin picks anything. I kept it to one request per selected pipeline (fetched
+   lazily on tab click), consistent with the plan's own N+1 avoidance stance elsewhere.
+   Tabs show pipeline name only; the per-stage counts inside the active board are real.
+4. **Client (tenant) picker is local React state, not a route param.** The brief's file
+   list doesn't include a roster/picker component, and the plan's Task 7 scope is "the
+   board," not tenant routing. `SetterSuite` pulls `useAdminClientsQuery`, defaults to the
+   first client returned, and offers a plain `<select>` (styled with the existing
+   `.pk-select` token class) to switch. This is deliberately the simplest thing that lets
+   the board be pointed at any client (not hardcoded to test-account), matching "an
+   admin-only screen where our team works one client's sales leads." If Task 8's cockpit
+   wants URL-addressable tenant state (`/admin/setter/:tenantId`) that's a straightforward
+   follow-up; I didn't add it here to avoid guessing at the cockpit's own routing needs.
+5. **Card rail priority.** `attempts === 0` (danger) and the 24h-uncontacted-in-a-needs-
+   dialing-stage case (warning) can both be true at once (e.g. a lead sitting untouched for
+   3 days). `cardRail` picks danger over warning in that case, on the reasoning that "never
+   dialed at all" is the more urgent state. Tested explicitly
+   (`"danger outranks warning when both conditions hold"`).
+6. **Whole-pipeline empty state.** Per-column empty copy is now honest and specific
+   ("No leads waiting on a dial." for needs-dialing stages, "No leads in this stage yet."
+   otherwise) rather than Board.tsx's bare "Empty." I did not add a separate whole-board
+   empty banner on top of that (test-account currently has zero leads in all 8 pipelines,
+   so on first load every column will show this text simultaneously, with real stage names,
+   dots, and needs-dialing chips still visible above each one) — that seemed like the more
+   informative state than collapsing the board into one generic message and losing the
+   pipeline structure. Flagging so you can weigh in once you see it live.
+7. **Selection is a toggle.** Clicking a selected card deselects it (since there's no
+   cockpit yet to give the admin another way to close the selection). Selected state is
+   visualized with a `box-shadow` brand ring, composed with the rail's inset shadow when
+   both apply (can't stack two Tailwind `shadow-*` classes, so `SetterCard` builds the
+   `boxShadow` style string by hand).
+
+## What Task 8 (the cockpit) needs to know
+
+- `SetterSuite` holds `selectedLead: ApiSetterLead | null` and passes
+  `onSelectLead={selectLead}` down to `SetterBoard` → `SetterCard`. The seam is exactly
+  that piece of state plus the callback; nothing else assumes a cockpit exists yet.
+- `now` (from `useNow()`, minute-resolution ms) is threaded down to `SetterBoard`/
+  `SetterCard` for both the "time in" display and the rail's 24h computation, matching how
+  `Board.tsx` already does it.
+
+## Commands run
+
+```
+cd command-center/app
+npx vitest run src/lib/setterModel.test.ts   # failed (module missing) before implementation
+npx vitest run src/lib/setterModel.test.ts   # 11 passed after implementation
+npm run typecheck                             # clean, no errors
+npm test -- --run                             # 917 tests passed, 87 files (0 failures)
+npm run build                                 # tsc + vite build succeeded
+```
+
+### Full `npm test -- --run` tail
+
+```
+ Test Files  87 passed (87)
+      Tests  917 passed (917)
+```
+
+### `npm run typecheck` output
+
+```
+> client-dashboard@0.1.0 typecheck
+> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
+```
+(no output = clean)
+
+### `npm run build` output (tail)
+
+```
+✓ 2249 modules transformed.
+dist/assets/index-CjIduf8I.css   105.14 kB │ gzip:  18.33 kB
+dist/assets/index-hSCN4QbF.js  1,494.47 kB │ gzip: 391.42 kB
+✓ built in 4.96s
+PWA v1.3.0 ... files generated, dist/sw.js
+```
+
+Confirmed by grep that the built bundle actually contains the new page's strings
+(`"Setter Suite"`, `"Never dialed"`, `"Needs dialing"`, `"Showing the first 1,000 leads"`),
+so this isn't a stale/cached build.
+
+## What I could not verify
+
+No one can drive this UI through a real admin session in this environment (minting an
+admin session is classifier-blocked, the same limitation recorded against every other admin
+surface in this project's memory). So the following are **unverified, code-reviewed and
+type-checked only**:
+
+- That the page actually renders correctly in a browser, light and dark theme both.
+- That the client picker, pipeline tabs, and board interact correctly against a live
+  `/admin/setter/pipelines` + `/admin/setter/leads` response (I read the real backend
+  route/response shapes and matched them exactly, but never hit them over HTTP with a
+  signed session).
+- That the empty state actually looks right against the test account (which, per the
+  progress ledger, genuinely has zero opportunities in every pipeline right now) — this is
+  the state Jake will actually see first and I could not screenshot it.
+- The Sales spine icon's new destination, `/admin/setter`, has not been clicked through
+  live.
+- Visual QA against the approved mockup (`setter-suite-mockups.html`, direction 1 "Classic
+  Board") was done by re-reading its CSS/markup and mirroring the same tokens, spacing, and
+  structure, not by rendering both side by side.
+
+Jake (or whoever next has a live admin session) should click through `/admin/setter` in
+both themes before trusting this is pixel-right.
+
+## Fix pass 1
+
+Addressed three review findings. Files touched, all in scope: `src/lib/setterModel.ts`,
+`src/lib/setterModel.test.ts`, `src/components/admin/setter/SetterCard.tsx`.
+`SetterBoard.tsx` needed no change.
+
+### Finding 1 (Important): stale state was color-only
+
+The "stale" rail (warning tone, a needs-dialing lead uncontacted past 24h) had no text or
+icon, unlike "never dialed" (danger tone), which also carries a "Never dialed" chip. Fixed
+by adding a chip using the exact same vocabulary/markup as the existing chips (`rounded-full`,
+`bg-{tone}-tint`, `text-{tone}`, `text-[9.5px] font-bold uppercase tracking-wide`), reusing
+the warning tokens the rail itself already uses (`--warning`/`--warning-tint`, defined for
+both themes in `src/index.css`).
+
+The chip states the actual fact rather than just "Stale": a new pure helper,
+`staleWaitingLabel(createdAt, now)` in `setterModel.ts`, renders "Waiting {N}h" under a day
+and "Waiting {N}d" at a day or more (same hour/day bucketing `timeAgo.ts` uses, phrased for
+the chip's vocabulary instead of a relative-timestamp caption). It falls back to the bare
+word "Waiting" on an unparseable date rather than throwing or showing "NaNh".
+
+`SetterCard.tsx` renders this chip whenever `rail === "warning"`, right after the
+attempts/never-dialed chip. Since `isStaleUncontacted` requires `!lead.contacted`, the new
+chip and the existing "Spoke" chip can never both render on the same card. The rail's inset
+color bar is untouched, so the state is now both color and text, not text replacing color.
+
+Priority was already correct and untouched: `cardRail()` (in `setterModel.ts`, not modified
+by this pass) still returns `"danger"` before checking `"warning"`, so a lead with zero
+attempts always shows the danger rail + "Never dialed" chip even if it is also stale. This
+is covered by the existing test `"danger outranks warning when both conditions hold"`, which
+still passes unmodified.
+
+TDD followed for the new pure logic: wrote the `staleWaitingLabel` describe block first
+(three cases: hours, days, unparseable date), ran it, watched all three fail with
+"staleWaitingLabel is not a function", then implemented. One test's fixture data was wrong
+on the first pass (26h fell into the day bucket by design, same as `timeAgo`), fixed the
+test to 20h and reran green.
+
+### Finding 2 (Minor): duplicated `needsDialing`, one copy dead
+
+Deleted the client-side `needsDialing()` export and its describe block from
+`setterModel.test.ts`, rather than finding a use for it.
+
+Reasoning: grepped the whole `src/` tree and it had exactly one caller, its own test.
+`SetterBoard.tsx` already receives `stage.needsDialing` as a boolean straight off the wire
+(`ApiSetterPipeline.stages[].needsDialing` in `api.ts`), computed once, server-side, in
+`functions/api/admin/setter/pipelines.ts` (`shapeSetterPipeline`) against the live stage
+name, with an identical regex. There is no place in the client where recomputing the flag
+from a stage name would be correct instead of just trusting the field the server already
+sent: the server is the one that actually resolves live pipeline data, so it is already the
+authoritative source, and the client only ever holds the resolved boolean, never a bare
+stage name it would need to re-derive it from. Keeping the client copy "just in case" is
+exactly the kind of drift risk the finding describes, so it goes. Left a comment in
+`setterModel.ts` at the deletion site pointing at the server file, so nobody re-adds it
+without reading why it isn't there.
+
+### Finding 3 (Minor): focus styling inconsistency
+
+Added `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40` to the
+card `<button>` in `SetterCard.tsx`, matching `RecurringRow`/`PlainRow` in
+`src/routes/Customers.tsx` exactly (same ring width, same brand/40 tone).
+
+### Commands run
+
+```
+cd command-center/app
+npx vitest run src/lib/setterModel.test.ts   # 3 new tests failed (function missing) before implementation
+npx vitest run src/lib/setterModel.test.ts   # 1 of 3 new tests failed on bad fixture data (26h → day bucket by design)
+npx vitest run src/lib/setterModel.test.ts   # 12 passed after fixing the fixture
+npm test -- --run                             # 937 tests passed, 88 files
+npm run typecheck                             # clean, no output
+npm run build                                 # tsc + vite build succeeded
+```
+
+### Full `npm test -- --run` tail
+
+```
+ Test Files  88 passed (88)
+      Tests  937 passed (937)
+ Duration  4.14s (transform 4.30s, setup 0ms, collect 12.92s, tests 1.10s, environment 25ms, prepare 16.90s)
+```
+
+### `npm run typecheck` output
+
+```
+> client-dashboard@0.1.0 typecheck
+> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
+```
+(no output = clean)
+
+### `npm run build` output (tail)
+
+```
+✓ 2254 modules transformed.
+dist/assets/index-BnF8-Bth.css   105.45 kB │ gzip:  18.41 kB
+dist/assets/index-D4vQ11Ae.js  1,512.54 kB │ gzip: 395.57 kB
+✓ built in 4.77s
+PWA v1.3.0 ... files generated, dist/sw.js
+```
+
+Did not re-verify with a live admin session (same limitation as the original pass: minting
+an admin session is classifier-blocked in this environment). The new chip and focus ring are
+reviewed by markup/token match against sibling components, not screenshotted.
+
+## Concerns to flag before Task 8
+
+- Tenant/pipeline selection lives in component-local `useState` with no URL param. If Task
+  8's cockpit wants a shareable/bookmarkable URL per client (`/admin/setter/:tenantId`),
+  that's a routing change, not just an addition — flag it early rather than bolting it on.
+- The "source chip" gap (item 1 above): if a future backend change adds a light source
+  field to `ApiSetterLead` (e.g. a single non-N+1 derived tag), `SetterCard` has a clear
+  slot to add it back in.
diff --git a/.superpowers/sdd/task-8-report.md b/.superpowers/sdd/task-8-report.md
new file mode 100644
index 0000000..282c1cc
--- /dev/null
+++ b/.superpowers/sdd/task-8-report.md
@@ -0,0 +1,293 @@
+# Task 8 report: the cockpit
+
+## Summary
+
+Built the Setter Suite cockpit: a panel docked to the right of the board (Task 7) showing the
+selected lead, where the setter logs a dial, applies tags, and books an estimate. Wired into
+`SetterSuite.tsx` at the seam Task 7 left (`selectedLead` state + `onSelectLead`).
+
+## Files created
+
+- `command-center/app/src/lib/setterCockpit.ts` - pure logic: the five outcomes and their API
+  values, `defaultSpokeForOutcome`, `isContradictoryDial`, the optimistic dial builder/reducer
+  (`buildOptimisticDial`, `prependOptimisticDial`, `bumpLeadForDial`, `isOptimisticDial`), and
+  slot/day/end-time formatting for the booking grid.
+- `command-center/app/src/lib/setterCockpit.test.ts` - 19 tests for all of the above.
+- `command-center/app/src/components/admin/setter/SetterCockpit.tsx` - the docked panel shell:
+  identity header (click-to-call, mailto), sticky within the page's own scroll container with
+  its own internal scroll region, sections in order Log this call / Tags / Book an estimate /
+  Call history.
+- `command-center/app/src/components/admin/setter/DialLogger.tsx` - the five outcome buttons
+  (Booked, Not interested, No answer, Reschedule, Bad lead), the spoke override toggle
+  (defaults per outcome, overridable), an optional note, and the submit that calls
+  `useLogSetterDial`. Blocks submit client-side on the no_answer+spoke:true contradiction and
+  shows a specific message if the API still rejects it as `contradictory`.
+- `command-center/app/src/components/admin/setter/TagField.tsx` - current tags as removable
+  chips, a free-text add input, a "Used before" suggestion row sourced from this contact's own
+  `dials[].tagsApplied` history (there is no location-wide tag list endpoint, see Deviations),
+  and the required one-line warning that tagging fires the client's automations.
+- `command-center/app/src/components/admin/setter/SlotPicker.tsx` - calendar name + duration
+  inputs, a live day selector, a slot grid for the selected day, and a Book button. Renders the
+  `needs_staff` case with the exact copy from the brief. Never retries the booking POST; the
+  button disables the instant the mutation is in flight.
+
+## Files modified
+
+- `command-center/app/src/lib/api.ts` - added `ApiSetterDial` and `ApiSetterLeadDetail` wire
+  types, mirroring `functions/api/admin/setter/lead/[contactId].ts` and
+  `functions/api/admin/setter/dials.ts:shapeDialRow` exactly.
+- `command-center/app/src/hooks/useApi.ts` - added `useSetterLeadDetailQuery`,
+  `useLogSetterDial` (optimistic, with rollback via full snapshot restore, matching the existing
+  `useMarkJobPaid` pattern in this file), `useSetterTagsMutation`, `useSetterSlotsQuery`,
+  `useSetterBookMutation` (`retry: false`, explicit even though it matches the global mutation
+  default, since it is a hard requirement not an incidental one).
+- `command-center/app/src/routes/admin/SetterSuite.tsx` - wraps the board in a flex row with the
+  new cockpit, added `closeCockpit`, passes `tenantId`/`pipelineId`/`pipelineName`/`lead` down.
+  This file was in Task 7's scope but had to be touched here since it owns the only render seam
+  the cockpit plugs into.
+
+## Commands run
+
+```
+npx vitest run src/lib/setterCockpit.test.ts   # before implementation: 1 failed suite (module missing)
+npx vitest run src/lib/setterCockpit.test.ts   # after: 19 passed
+npm test                                        # 88 files, 936 passed (was 917 before this task)
+npm run typecheck                               # tsc --noEmit (app) + tsc --noEmit -p functions/tsconfig.json: clean
+npm run build                                   # tsc && vite build: clean, dist/ produced
+```
+
+## Full test output (npm test, tail)
+
+```
+ Test Files  88 passed (88)
+      Tests  936 passed (936)
+```
+
+## Full typecheck output
+
+```
+> client-dashboard@0.1.0 typecheck
+> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
+```
+(no output, exit 0)
+
+## Full build output (tail)
+
+```
+> client-dashboard@0.1.0 build
+> tsc && vite build
+
+vite v7.3.6 building client environment for production...
+transforming...
+2254 modules transformed.
+dist/registerSW.js              0.13 kB
+dist/manifest.webmanifest       0.44 kB
+dist/index.html                 1.47 kB | gzip:   0.64 kB
+dist/assets/index-BnF8-Bth.css  105.45 kB | gzip:  18.41 kB
+dist/assets/index-BRfS0Cgt.js   1,512.10 kB | gzip: 395.46 kB
+(chunk-size warning, pre-existing, not introduced by this task)
+built in 4.62s
+
+PWA v1.3.0
+Building src/sw.ts service worker
+88 modules transformed.
+dist/sw.mjs  26.14 kB | gzip: 8.56 kB
+built in 148ms
+precache  19 entries (2661.36 KiB)
+files generated
+```
+
+## How the five requirements-that-matter-more-than-they-look were handled
+
+1. **Exact five outcomes.** `OUTCOMES` in `setterCockpit.ts` is the single source of truth
+   (value + label), consumed by `DialLogger`. Tested verbatim in `setterCockpit.test.ts`.
+
+2. **no_answer + spoke:true guard.** `defaultSpokeForOutcome` sets the toggle the instant an
+   outcome is picked. `isContradictoryDial` (same predicate as the server's
+   `validateDialBody`) disables the submit button and shows inline red text if the setter
+   overrides into the bad combination. If the API still returns `contradictory` (e.g. a stale
+   client), `DialLogger`'s mutate-level `onError` reads `err.body.error` and shows a specific
+   toast rather than a generic failure message.
+
+3. **Tag warning copy.** `TagField` always renders: "Adding or removing a tag fires this
+   client's automations immediately, only tag what you mean to trigger." No GHL/GoHighLevel
+   naming anywhere in UI copy.
+
+4. **Optimistic dial + rollback.** `useLogSetterDial`'s `onMutate` builds a temp-id dial
+   (`buildOptimisticDial`), prepends it to the cached lead-detail dial list
+   (`prependOptimisticDial`) and bumps the matching board card in the cached leads list
+   (`bumpLeadForDial`, mirroring `functions/lib/setterMetrics.ts:rollUpByContact`'s rules:
+   attempts+1, contacted only ever turns on, lastOutcome becomes the new dial's outcome). On
+   error both caches are restored to their exact pre-mutate snapshot (same pattern as the
+   existing `useMarkJobPaid` hook), so a failed write can never leave a phantom dial or an
+   inflated attempt count. `onSettled` invalidates both queries to reconcile with the server.
+
+5. **Booking not retryable.** `useSetterBookMutation` sets `retry: false` explicitly (the
+   project's mutation default is already 0, kept explicit as a hard requirement). `SlotPicker`
+   disables the Book button via `bookMutation.isPending` the instant it fires, so a double-click
+   cannot queue a second POST.
+
+6. **needs_staff rendered distinctly.** `SlotPicker` checks `err.body.error === "needs_staff"`
+   from the slots query and renders the brief's exact copy: "This calendar has no team members
+   assigned, so it cannot return availability." A separate `calendar_not_found` branch and a
+   generic-error branch are also distinct, never collapsed into an empty grid.
+
+## Deviations from the literal brief text
+
+- **TagField's "location's live tag list."** No backend endpoint returns a location-wide tag
+  catalog (only `functions/api/admin/setter/tags.ts`, which returns one contact's current tags
+  after a write, was in scope). Rather than invent a new endpoint (backend is marked DONE) or
+  fabricate a static tag list, the suggestion row is sourced from real, live data already on the
+  lead detail response: the union of `tagsApplied` recorded on this same contact's past dials,
+  labeled "Used before." Flagging this since it is a legitimate reading of unavailable data, not
+  a literal match to "location's tag list."
+- **Calendar name and duration are editable inputs**, not a hardcoded constant. The client-facing
+  booking flow (`CallConsole.tsx`) hardcodes `"Home Estimate"` because it only ever books one
+  named calendar for one client. The Setter Suite works every pipeline for any client via a
+  tenant dropdown, and `slots.ts`/`book.ts` are both generic on `calendarName` with no per-client
+  config field for it, so the cockpit exposes it as a field (defaulted to `"Home Estimate"`,
+  60 minutes) rather than guessing a fixed value that would be wrong for other clients/calendars.
+- **"Notes" as a distinct final section.** The brief's section order lists "...history, notes."
+  There is no generic contact-notes endpoint in the admin/setter backend contract (only the dial
+  row's own optional `note` column). Reusing the client-facing `NoteList` component would have
+  hit the wrong tenant's credentials, since it resolves tenant from the client session cookie,
+  not from an admin `tenantId` param. The dial's note field is therefore captured as part of
+  "Log this call" (DialLogger) and displayed per-entry in "Call history," rather than adding an
+  unsupported general notes feature.
+
+## What could not be verified
+
+Nobody can drive this through a real admin session in this environment (no live admin login, no
+Doppler-backed CRM credentials here). Not eyeballed:
+- The docked layout's sticky/independent-scroll behavior in a real browser at various viewport
+  heights (verified only by reading the CSS classes against the `LeadDetailDesktop.tsx` /
+  `RightRail.tsx` precedents already shipped in this codebase; no Playwright run was possible
+  without a live session).
+- Light/dark theme rendering (token classes only, e.g. `bg-surface-2`, `text-brand-text`,
+  `border-warning`; not screenshotted).
+- The actual optimistic-to-real reconciliation against a live GHL contact (unit-tested the pure
+  reducers; the mutation wiring itself is exercised only by TypeScript, not a live network call).
+- Whether `"Home Estimate"` is in fact the right default calendar name for clients other than
+  Willis; it is editable, so this only affects the pre-filled value.
+
+## Verification
+
+`npm test`, `npm run typecheck`, and `npm run build` all pass, run from
+`command-center/app` in this worktree. Full output above.
+
+## Fix pass 1
+
+Two Important review findings fixed. No pure-logic changes were needed, so `setterCockpit.ts`
+and its test are untouched (only the two component files changed).
+
+### Finding 1: spoke override was keyboard-unreachable
+
+`DialLogger.tsx`'s spoke toggle was a `<span role="switch" onClick={...}>` with no `tabIndex`
+and no `onKeyDown`: decorated to look like a control but impossible to focus or activate from a
+keyboard. Since this toggle is the only way to correct the outcome buttons' auto-set default
+before the backend's `no_answer` + `spoke:true` rejection, a keyboard user could get stuck unable
+to log a true no-answer call as anything else.
+
+**Reused `src/components/ui/Switch.tsx` as-is**, no changes needed to that file. It is already a
+real `<button role="switch">` with `aria-checked`, `focus-visible:ring-2 focus-visible:ring-brand/40`,
+and a disabled state, matching exactly what the finding asked for. `DialLogger.tsx` now imports it
+and renders `<Switch checked={spoke} onChange={setSpoke} label="Spoke with them" />` in place of
+the hand-rolled span pair. Followed the same call pattern already used at
+`SettingsControls.tsx:292` (`ChannelsControl`): visible label text as a sibling `<span>`, plus the
+`label` prop as the switch's own `aria-label`, both inside a plain `<div>` row (dropped the
+enclosing `<label>` since `Switch`'s own accessible name via the `label` prop makes it redundant
+and the button-in-label nesting pattern that existed before added nothing `Switch` doesn't already
+provide).
+
+One visible side effect: `Switch` renders its "on" fill as `bg-brand` (with the brand gradient),
+not the bespoke `bg-positive` green the hand-rolled span used. The `Phone`/`PhoneOff` icon beside
+the label still switches `text-positive`/`text-faint` on state change, so the on/off distinction
+is still colour-coded, just via the icon rather than the track. Flagging this as an intentional
+consequence of reusing the shared component rather than a bug.
+
+### Finding 2: failed detail fetch was indistinguishable from empty tags/history
+
+`SetterCockpit.tsx` only branched on `detailQuery.isLoading`, never `detailQuery.isError`. A
+failed `/api/admin/setter/lead/:contactId` fetch left `tags` and `dials` as their `?? []`
+fallbacks, so the panel rendered "No tags on this contact yet." and "No dials logged yet." on a
+request that never landed, exactly as if the contact truly had no history. A setter reading that
+could start dialling a contact who has actually been called before.
+
+Added a `detailQuery.isError` branch to both sections in `SetterCockpit.tsx`:
+- **Tags section**: when `detailQuery.isError`, renders `DetailLoadError` instead of `TagField`
+  (left `TagField.tsx` itself untouched, out of scope; the branch lives in the parent since tags
+  is an all-or-nothing prop today).
+- **Call history section**: added `detailQuery.isError` as a branch between the existing
+  `isLoading` and the `dials.length === 0` empty check, so error, loading, and true-empty are
+  three distinct renders, matching `SlotPicker.tsx`'s standard of never collapsing a failed fetch
+  into an empty grid.
+
+New local component `DetailLoadError` (defined once in `SetterCockpit.tsx`, used by both
+sections) follows the same convention as `ActivityDesktop.tsx`'s `FeedError`: a danger-tinted
+panel (`border-danger/30 bg-danger-tint`) with a `TriangleAlert` icon, states what failed
+("Could not load tags." / "Could not load call history."), and a `Button variant="secondary"
+size="sm"` labeled "Retry" that calls `detailQuery.refetch()`. A retry affordance was appropriate
+per the brief since this is a plain GET (no mutation/booking logic touched). Sized down from
+`FeedError`'s full-width layout to fit this panel's narrower docked columns, and reduced text
+size to `text-[12.5px]` to match the rest of the cockpit's compact type scale.
+
+No em dashes, no GoHighLevel/GHL naming, only design tokens (`border-danger/30`, `bg-danger-tint`,
+`text-danger`), both themes covered since every class used is an existing token already proven in
+light/dark elsewhere in this app.
+
+### Commands run
+
+```
+npm test          # from command-center/app
+npm run typecheck # from command-center/app
+npm run build     # from command-center/app
+```
+
+### Full test output (tail)
+
+```
+ Test Files  88 passed (88)
+      Tests  937 passed (937)
+   Start at  16:46:19
+   Duration  3.81s (transform 3.50s, setup 0ms, collect 11.07s, tests 1.02s, environment 23ms, prepare 15.99s)
+```
+
+### Full typecheck output
+
+```
+> client-dashboard@0.1.0 typecheck
+> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
+```
+(no output, exit 0)
+
+### Full build output (tail)
+
+```
+> client-dashboard@0.1.0 build
+> tsc && vite build
+
+vite v7.3.6 building client environment for production...
+transforming...
+2254 modules transformed.
+dist/registerSW.js              0.13 kB
+dist/manifest.webmanifest       0.44 kB
+dist/index.html                 1.47 kB | gzip:   0.64 kB
+dist/assets/index-BnF8-Bth.css  105.45 kB | gzip:  18.41 kB
+dist/assets/index-Clf7hAxU.js   1,512.82 kB | gzip: 395.61 kB
+(chunk-size warning, pre-existing, not introduced by this fix pass)
+built in 5.03s
+
+PWA v1.3.0
+Building src/sw.ts service worker ("es" format)...
+88 modules transformed.
+dist/sw.mjs  26.14 kB | gzip: 8.56 kB
+built in 156ms
+precache  19 entries (2662.06 KiB)
+files generated
+dist/sw.js
+```
+
+### Files changed this pass
+
+- `command-center/app/src/components/admin/setter/DialLogger.tsx`
+- `command-center/app/src/components/admin/setter/SetterCockpit.tsx`
diff --git a/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts b/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts
index cac3090..4dc0ab8 100644
--- a/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts
+++ b/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts
@@ -1,52 +1,46 @@
 import type { Env, ApiData } from "../../../../lib/env";
 import { getServiceClient } from "../../../../lib/supabase";
 import { logAdminAction } from "../../../../lib/adminAuth";
 import { hashPassword } from "../../../../lib/password";
 import { listGhlLocationUsers } from "../../../../lib/staff";
+import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
+import type { GhlContext } from "../../../../lib/ghl";
 
 // POST /api/admin/clients/:tenantId/import-staff  (admin-only)
 // Pre-populate a client's team from the users GoHighLevel already has on their
 // sub-account. Each imported person becomes a staff_accounts row linked by
 // ghl_user_id, but DISABLED with an unusable random password: the owner sets a
 // real password (and grants) on the Team screen before they can sign in. People
 // already imported (matched by email) are skipped, never overwritten.
 export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
   const client = getServiceClient(ctx.env);
   if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
 
   const tenantId = ctx.params.tenantId as string;
 
-  // ghl_token is intentionally excluded from getTenantById, so read the creds
-  // we need directly here (service client, never exposed to the browser).
-  const { data: tenant } = await client
-    .from("tenants")
-    .select("id, ghl_location_id, ghl_token")
-    .eq("id", tenantId)
-    .maybeSingle();
-  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
-
-  const t = tenant as { id: string; ghl_location_id: string; ghl_token: string };
-  const placeholder = (v: string) => {
-    const s = (v ?? "").trim().toLowerCase();
-    return s === "" || s === "pending" || s === "env";
-  };
-  if (placeholder(t.ghl_location_id) || placeholder(t.ghl_token)) {
-    return Response.json(
-      { error: "connect this client to GoHighLevel first" },
-      { status: 400 },
-    );
+  let gctx: GhlContext;
+  try {
+    gctx = await getGhlContextForTenant(ctx.env, tenantId);
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    // tenant_not_found keeps this route's existing "client not found" wording,
+    // which matches every other admin/clients/:tenantId endpoint. The other
+    // codes (ghl_not_connected, tenant_lookup_failed, supabase_not_configured)
+    // surface the helper's own status and message.
+    const error = e.code === "tenant_not_found" ? "client not found" : e.message;
+    return Response.json({ error }, { status: e.status });
   }
 
   const users = await listGhlLocationUsers({
-    token: t.ghl_token,
-    locationId: t.ghl_location_id,
+    token: gctx.token,
+    locationId: gctx.locationId,
   });
   if (users.length === 0) {
     return Response.json({ imported: 0, skipped: 0, total: 0 });
   }
 
   // Existing staff emails for this tenant, to skip rather than clobber.
   const { data: existingRows } = await client
     .from("staff_accounts")
     .select("email")
     .eq("tenant_id", tenantId);
diff --git a/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts b/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts
index a4dcd64..bea7c0d 100644
--- a/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts
+++ b/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts
@@ -1,44 +1,44 @@
 import type { Env, ApiData } from "../../../../lib/env";
 import { getServiceClient } from "../../../../lib/supabase";
-import { ghlFetch } from "../../../../lib/ghl";
+import { ghlFetch, type GhlContext } from "../../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
 import { summarizeReadiness, type GhlCustomValue } from "../../../../../src/lib/onboarding";
 
 // GET /api/admin/onboarding/:tenantId/readiness -> live auto-checks
 export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
   const client = getServiceClient(ctx.env);
   if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
   const tenantId = ctx.params.tenantId as string;
 
-  const { data: tenant } = await client
-    .from("tenants")
-    .select("ghl_location_id, ghl_token")
-    .eq("id", tenantId)
-    .maybeSingle();
-  const locationId = (tenant?.ghl_location_id as string) ?? "";
-  const token = (tenant?.ghl_token as string) ?? "";
-  if (!locationId || !token || locationId === "pending" || token === "pending") {
+  let gctx: GhlContext;
+  try {
+    gctx = await getGhlContextForTenant(ctx.env, tenantId);
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    // Not found, not connected, or the lookup itself failed: this screen's
+    // job is a checklist, not an error page, so any of those states surfaces
+    // as the same "not wired up yet" item rather than an HTTP error.
     return Response.json({ checks: [{ key: "token", ok: false, detail: "No token/location set yet" }] });
   }
-  const gctx = { token, locationId };
 
   let tokenValid = false;
   let customValues: GhlCustomValue[] = [];
-  const cvRes = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}/customValues`);
+  const cvRes = await ghlFetch(gctx, `/locations/${encodeURIComponent(gctx.locationId)}/customValues`);
   if (cvRes.ok) {
     tokenValid = true;
     const data = (await cvRes.json()) as { customValues?: GhlCustomValue[] };
     customValues = data.customValues ?? [];
   }
 
   let calendarIds: string[] = [];
-  const calRes = await ghlFetch(gctx, `/calendars/?locationId=${encodeURIComponent(locationId)}`, {
+  const calRes = await ghlFetch(gctx, `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`, {
     headers: { Version: "2021-04-15" },
   });
   if (calRes.ok) {
     const data = (await calRes.json()) as { calendars?: { id: string }[] };
     calendarIds = (data.calendars ?? []).map((c) => c.id);
   }
 
   const checks = summarizeReadiness({ fields: {}, customValues, calendarIds, tokenValid });
   return Response.json({ checks });
 };
diff --git a/command-center/app/functions/api/admin/setter/book.test.ts b/command-center/app/functions/api/admin/setter/book.test.ts
new file mode 100644
index 0000000..106208c
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/book.test.ts
@@ -0,0 +1,96 @@
+import { describe, it, expect } from "vitest";
+import { validateBookBody } from "./book";
+
+// validateBookBody is the only pure logic in this route (the rest is a live
+// CRM round-trip through the non-retrying createAppointment), so this covers
+// every 400 path before a request can reach the booking write.
+
+describe("validateBookBody", () => {
+  it("requires tenantId", () => {
+    const r = validateBookBody({
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_tenant_id");
+  });
+
+  it("requires calendarName", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_calendar_name");
+  });
+
+  it("requires contactId", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_contact_id");
+  });
+
+  it("requires both startTime and endTime", () => {
+    const missingEnd = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+    });
+    expect(missingEnd.ok).toBe(false);
+    expect(missingEnd.code).toBe("missing_time_range");
+
+    const missingStart = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(missingStart.ok).toBe(false);
+    expect(missingStart.code).toBe("missing_time_range");
+  });
+
+  it("rejects blank strings the same as missing fields", () => {
+    const r = validateBookBody({
+      tenantId: "  ",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_tenant_id");
+  });
+
+  it("accepts a complete body, title optional", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(true);
+  });
+
+  it("accepts a complete body with a title", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+      title: "Estimate with Jane",
+    });
+    expect(r.ok).toBe(true);
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/book.ts b/command-center/app/functions/api/admin/setter/book.ts
new file mode 100644
index 0000000..2482d1c
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/book.ts
@@ -0,0 +1,117 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { readJsonBody } from "../../../lib/body";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { getServiceClient } from "../../../lib/supabase";
+import { logAdminAction } from "../../../lib/adminAuth";
+import { resolveCalendarByName, createAppointment } from "../../lib/appointments";
+
+// POST /api/admin/setter/book (admin-only, gated in _middleware.ts). Books a
+// real appointment on a named calendar the moment a setter gets someone on
+// the phone and locks in a time. Calendar resolved BY NAME (never a
+// hardcoded id, which differs per client) via the same
+// resolveCalendarByName used by the client-facing booking endpoint
+// (functions/api/appointments/index.ts), and the write goes through the
+// same createAppointment in ../../lib/appointments unchanged.
+//
+// Terminal write: createAppointment deliberately does not retry on failure,
+// because a retried POST can double-book a real customer into a real
+// calendar. This route must honour that: the call below runs exactly once,
+// no retry wrapper, no "for robustness" resend.
+//
+// Degrades honestly: a round-robin calendar with no team members assigned
+// returns 422 { error: "needs_staff" } so the setter sees "this calendar
+// has no staff assigned" instead of a generic failure that reads as their
+// own mistake.
+
+export interface BookBody {
+  tenantId?: string;
+  calendarName?: string;
+  contactId?: string;
+  startTime?: string;
+  endTime?: string;
+  title?: string;
+}
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+// Pure, split out so it is unit-testable without a request.
+export function validateBookBody(body: BookBody): ValidationResult {
+  if (!body.tenantId || !body.tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
+  }
+  if (!body.calendarName || !body.calendarName.trim()) {
+    return { ok: false, code: "missing_calendar_name", error: "calendarName is required" };
+  }
+  if (!body.contactId || !body.contactId.trim()) {
+    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
+  }
+  if (!body.startTime || !body.endTime) {
+    return { ok: false, code: "missing_time_range", error: "startTime and endTime are required" };
+  }
+  return { ok: true };
+}
+
+export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const body = await readJsonBody<BookBody>(ctx.request);
+  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
+
+  const validation = validateBookBody(body);
+  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
+
+  const tenantId = body.tenantId!.trim();
+  const calendarName = body.calendarName!.trim();
+  const contactId = body.contactId!.trim();
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    const calendarId = await resolveCalendarByName(gctx, calendarName);
+    if (!calendarId) {
+      return Response.json(
+        { error: "calendar_not_found", calendar: calendarName },
+        { status: 422 },
+      );
+    }
+
+    // Single attempt, no retry: see the file header. A second call here on a
+    // timeout or transient error could create two appointments for the same
+    // slot.
+    const result = await createAppointment(gctx, {
+      calendarId,
+      contactId,
+      startTime: body.startTime!,
+      endTime: body.endTime!,
+      title: body.title,
+    });
+
+    if (!result.ok) {
+      if (result.needsStaff) {
+        return Response.json({ error: "needs_staff" }, { status: 422 });
+      }
+      return Response.json(
+        { error: "ghl_error", status: result.status, body: result.body },
+        { status: 502 },
+      );
+    }
+
+    const client = getServiceClient(ctx.env);
+    if (client) {
+      await logAdminAction(client, ctx.data.admin!.id, "setter.book", tenantId, {
+        contactId,
+        calendarName,
+        appointmentId: result.id,
+        startTime: body.startTime,
+        endTime: body.endTime,
+      });
+    }
+
+    return Response.json({ ok: true, id: result.id }, { status: 201 });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/dials.test.ts b/command-center/app/functions/api/admin/setter/dials.test.ts
new file mode 100644
index 0000000..c2be9b8
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/dials.test.ts
@@ -0,0 +1,28 @@
+import { describe, it, expect } from "vitest";
+import { validateDialBody } from "./dials";
+
+// validateDialBody is the only pure logic in this route (the rest is a
+// Supabase insert), so this covers every 400 path, including the one input
+// that would otherwise silently corrupt the Contact rate.
+
+describe("validateDialBody", () => {
+  it("rejects an outcome outside the five allowed values", () => {
+    const r = validateDialBody({ tenantId: "t", contactId: "c", spoke: true, outcome: "maybe" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("bad_outcome");
+  });
+  it("accepts each of the five allowed outcomes", () => {
+    for (const o of ["booked","not_interested","no_answer","reschedule","bad_lead"]) {
+      expect(validateDialBody({ tenantId:"t", contactId:"c", spoke:false, outcome:o }).ok).toBe(true);
+    }
+  });
+  it("requires tenantId and contactId", () => {
+    expect(validateDialBody({ contactId: "c", spoke: true, outcome: "booked" }).ok).toBe(false);
+    expect(validateDialBody({ tenantId: "t", spoke: true, outcome: "booked" }).ok).toBe(false);
+  });
+  it("rejects a no_answer that claims someone spoke", () => {
+    const r = validateDialBody({ tenantId:"t", contactId:"c", spoke:true, outcome:"no_answer" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("contradictory");
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/dials.ts b/command-center/app/functions/api/admin/setter/dials.ts
new file mode 100644
index 0000000..e17eda0
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/dials.ts
@@ -0,0 +1,154 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { readJsonBody } from "../../../lib/body";
+import { getServiceClient } from "../../../lib/supabase";
+import { logAdminAction } from "../../../lib/adminAuth";
+
+// POST /api/admin/setter/dials (admin-only, gated in _middleware.ts). Appends
+// one row to setter_dials for a phone call a setter just made. Every derived
+// per-lead stat and headline rate (functions/lib/setterMetrics.ts) is built
+// from these rows, never stored redundantly, so this is the single write
+// path for the whole Setter Suite's history. See migration 0040 for the
+// column set and the DB-level check constraint on outcome.
+
+export const OUTCOMES = ["booked", "not_interested", "no_answer", "reschedule", "bad_lead"] as const;
+export type Outcome = (typeof OUTCOMES)[number];
+
+export interface DialBody {
+  tenantId?: string;
+  contactId?: string;
+  opportunityId?: string | null;
+  pipelineName?: string | null;
+  stageName?: string | null;
+  spoke?: boolean;
+  outcome?: string;
+  note?: string | null;
+  tagsApplied?: string[];
+}
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+// Pure, split out so it is unit-testable without a request. Every field the
+// DB also constrains (the outcome enum) is checked here too, so a bad
+// request 400s instead of surfacing the DB's check-constraint violation as a
+// 500.
+export function validateDialBody(body: DialBody): ValidationResult {
+  if (!body.tenantId || !body.tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
+  }
+  if (!body.contactId || !body.contactId.trim()) {
+    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
+  }
+  if (!body.outcome || !OUTCOMES.includes(body.outcome as Outcome)) {
+    return { ok: false, code: "bad_outcome", error: "outcome must be one of: " + OUTCOMES.join(", ") };
+  }
+  // The one input that silently corrupts the Contact rate metric: no_answer
+  // means nobody picked up, so it can never be paired with spoke: true. Must
+  // be a hard validation error, not a row that quietly overstates contacts.
+  if (body.outcome === "no_answer" && body.spoke === true) {
+    return {
+      ok: false,
+      code: "contradictory",
+      error: "outcome 'no_answer' cannot be paired with spoke: true",
+    };
+  }
+  return { ok: true };
+}
+
+// The shape returned to the client, camelCased, shared with the lead detail
+// endpoint's `dials` array (functions/api/admin/setter/lead/[contactId].ts).
+export interface ApiDialRow {
+  id: string;
+  contactId: string;
+  opportunityId: string | null;
+  pipelineName: string | null;
+  stageName: string | null;
+  dialedAt: string;
+  spoke: boolean;
+  outcome: string;
+  note: string | null;
+  tagsApplied: string[];
+  createdBy: string | null;
+  createdAt: string;
+}
+
+// The raw setter_dials row shape as it comes back from Supabase (0040).
+export interface RawDialRow {
+  id: string;
+  contact_id: string;
+  opportunity_id: string | null;
+  pipeline_name: string | null;
+  stage_name: string | null;
+  dialed_at: string;
+  spoke: boolean;
+  outcome: string;
+  note: string | null;
+  tags_applied: string[] | null;
+  created_by: string | null;
+  created_at: string;
+}
+
+export const DIAL_SELECT =
+  "id, contact_id, opportunity_id, pipeline_name, stage_name, dialed_at, spoke, outcome, note, tags_applied, created_by, created_at";
+
+export function shapeDialRow(row: RawDialRow): ApiDialRow {
+  return {
+    id: row.id,
+    contactId: row.contact_id,
+    opportunityId: row.opportunity_id,
+    pipelineName: row.pipeline_name,
+    stageName: row.stage_name,
+    dialedAt: row.dialed_at,
+    spoke: row.spoke,
+    outcome: row.outcome,
+    note: row.note,
+    tagsApplied: row.tags_applied ?? [],
+    createdBy: row.created_by,
+    createdAt: row.created_at,
+  };
+}
+
+export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const body = await readJsonBody<DialBody>(ctx.request);
+  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
+
+  const validation = validateDialBody(body);
+  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
+
+  const client = getServiceClient(ctx.env);
+  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
+
+  const adminId = ctx.data.admin!.id;
+
+  const { data, error } = await client
+    .from("setter_dials")
+    .insert({
+      tenant_id: body.tenantId,
+      contact_id: body.contactId,
+      opportunity_id: body.opportunityId ?? null,
+      pipeline_name: body.pipelineName ?? null,
+      stage_name: body.stageName ?? null,
+      spoke: body.spoke === true,
+      outcome: body.outcome,
+      note: body.note && body.note.trim() ? body.note.trim() : null,
+      tags_applied: body.tagsApplied ?? [],
+      created_by: adminId,
+    })
+    .select(DIAL_SELECT)
+    .single();
+  if (error || !data) {
+    return Response.json({ error: error?.message ?? "could not save dial" }, { status: 500 });
+  }
+
+  const dial = shapeDialRow(data as unknown as RawDialRow);
+  await logAdminAction(client, adminId, "setter.dial", body.tenantId!, {
+    contactId: body.contactId,
+    outcome: body.outcome,
+    spoke: dial.spoke,
+  });
+
+  return Response.json({ dial }, { status: 201 });
+};
diff --git a/command-center/app/functions/api/admin/setter/lead/[contactId].ts b/command-center/app/functions/api/admin/setter/lead/[contactId].ts
new file mode 100644
index 0000000..cc10468
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/lead/[contactId].ts
@@ -0,0 +1,82 @@
+import type { Env, ApiData } from "../../../../lib/env";
+import { ghlJson } from "../../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
+import { getServiceClient } from "../../../../lib/supabase";
+import { DIAL_SELECT, shapeDialRow, type ApiDialRow, type RawDialRow } from "../dials";
+
+// GET /api/admin/setter/lead/:contactId?tenantId= (admin-only, gated in
+// _middleware.ts). The cockpit's single-lead panel: one contact's live CRM
+// details plus its full dial history from setter_dials, newest first.
+//
+// Unlike the board list (functions/api/admin/setter/leads.ts), which
+// deliberately omits tags to avoid an N+1 contact fetch across a whole
+// column, this is exactly one contact, so fetching its tags here costs
+// nothing extra: one /contacts/{id} call already returns them.
+
+interface GhlContactResponse {
+  contact: {
+    id: string;
+    contactName?: string;
+    firstName?: string;
+    lastName?: string;
+    email?: string;
+    phone?: string;
+    tags?: string[];
+  };
+}
+
+export interface ApiSetterLeadDetail {
+  contactId: string;
+  name: string;
+  phone: string;
+  email: string;
+  tags: string[];
+  dials: ApiDialRow[];
+}
+
+export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
+  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
+  const contactId = ctx.params.contactId as string;
+  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
+  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+    const data = await ghlJson<GhlContactResponse>(
+      gctx,
+      `/contacts/${encodeURIComponent(contactId)}`,
+    );
+    const c = data.contact;
+    const name =
+      c.contactName ||
+      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
+      "Unknown";
+
+    let dials: ApiDialRow[] = [];
+    const client = getServiceClient(ctx.env);
+    if (client) {
+      const { data: rows, error } = await client
+        .from("setter_dials")
+        .select(DIAL_SELECT)
+        .eq("tenant_id", tenantId)
+        .eq("contact_id", contactId)
+        .order("dialed_at", { ascending: false });
+      if (error) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
+      dials = ((rows ?? []) as unknown as RawDialRow[]).map(shapeDialRow);
+    }
+
+    const lead: ApiSetterLeadDetail = {
+      contactId,
+      name,
+      phone: c.phone ?? "",
+      email: c.email ?? "",
+      tags: c.tags ?? [],
+      dials,
+    };
+
+    return Response.json({ lead });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/leads.test.ts b/command-center/app/functions/api/admin/setter/leads.test.ts
new file mode 100644
index 0000000..c1cb81d
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/leads.test.ts
@@ -0,0 +1,88 @@
+import { describe, it, expect } from "vitest";
+import { shapeSetterLead } from "./leads";
+import { rollUpByContact } from "../../../lib/setterMetrics";
+import type { GhlOpportunity } from "../../../lib/ghl";
+
+const stageNames = new Map([
+  ["s1", "Opted In (needs dialing)"],
+  ["s2", "Long Term Nurture"],
+]);
+
+describe("shapeSetterLead", () => {
+  it("merges a contact's dial roll-up into the card", () => {
+    const rollUps = rollUpByContact([
+      { contact_id: "c1", dialed_at: "2026-07-20T09:00:00Z", spoke: false, outcome: "no_answer" },
+      { contact_id: "c1", dialed_at: "2026-07-20T17:00:00Z", spoke: true, outcome: "booked" },
+    ]);
+    const o: GhlOpportunity = {
+      id: "o1",
+      name: "Jane Doe",
+      pipelineStageId: "s1",
+      contact: { id: "c1", phone: "555-1000", city: "Garden City" },
+      createdAt: "2026-07-19T00:00:00Z",
+    };
+
+    const lead = shapeSetterLead(o, stageNames, rollUps);
+
+    expect(lead).toEqual({
+      id: "o1",
+      contactId: "c1",
+      name: "Jane Doe",
+      phone: "555-1000",
+      city: "Garden City",
+      stageName: "Opted In (needs dialing)",
+      createdAt: "2026-07-19T00:00:00Z",
+      attempts: 2,
+      firstDialedAt: "2026-07-20T09:00:00Z",
+      contacted: true,
+      lastOutcome: "booked",
+    });
+  });
+
+  it("defaults every dial field for a lead never dialed", () => {
+    const o: GhlOpportunity = {
+      id: "o2",
+      contactId: "c2",
+      pipelineStageId: "s2",
+      contact: { id: "c2" },
+    };
+
+    const lead = shapeSetterLead(o, stageNames, new Map());
+
+    expect(lead.attempts).toBe(0);
+    expect(lead.firstDialedAt).toBeNull();
+    expect(lead.contacted).toBe(false);
+    expect(lead.lastOutcome).toBeNull();
+  });
+
+  it("falls back to the contact's first+last name when the opportunity has no name", () => {
+    const o: GhlOpportunity = {
+      id: "o3",
+      pipelineStageId: "s1",
+      contact: { id: "c3", firstName: "Sam", lastName: "Rivera" },
+    };
+    expect(shapeSetterLead(o, stageNames, new Map()).name).toBe("Sam Rivera");
+  });
+
+  it("falls back to Unknown when there is no opportunity name or contact name at all", () => {
+    const o: GhlOpportunity = { id: "o4", pipelineStageId: "s1", contact: { id: "c4" } };
+    expect(shapeSetterLead(o, stageNames, new Map()).name).toBe("Unknown");
+  });
+
+  it("resolves stageName to empty string for an unknown stage id, never a stale guess", () => {
+    const o: GhlOpportunity = { id: "o5", pipelineStageId: "does-not-exist", contact: { id: "c5" } };
+    expect(shapeSetterLead(o, stageNames, new Map()).stageName).toBe("");
+  });
+
+  it("prefers contact.id over the opportunity's own contactId when both are present", () => {
+    const o: GhlOpportunity = { id: "o6", contactId: "wrong", pipelineStageId: "s1", contact: { id: "right" } };
+    expect(shapeSetterLead(o, stageNames, new Map()).contactId).toBe("right");
+  });
+
+  it("defaults phone and city to empty strings, never undefined, when the contact omits them", () => {
+    const o: GhlOpportunity = { id: "o7", pipelineStageId: "s1", contact: { id: "c7" } };
+    const lead = shapeSetterLead(o, stageNames, new Map());
+    expect(lead.phone).toBe("");
+    expect(lead.city).toBe("");
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/leads.ts b/command-center/app/functions/api/admin/setter/leads.ts
new file mode 100644
index 0000000..b3d14a8
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/leads.ts
@@ -0,0 +1,127 @@
+import type { Env, ApiData } from "../../../lib/env";
+import {
+  ghlJson,
+  fetchAllOpportunities,
+  type GhlOpportunity,
+} from "../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { getServiceClient } from "../../../lib/supabase";
+import { rollUpByContact, type ContactRollUp, type DialRow } from "../../../lib/setterMetrics";
+
+// GET /api/admin/setter/leads?tenantId=&pipelineId= (admin-only, gated in
+// _middleware.ts). Every opportunity in ONE pipeline (the board shows one
+// pipeline's columns at a time), each merged with its dial history so the
+// card can show attempts/contacted/last outcome without a second round-trip
+// per lead.
+//
+// Deliberately excludes `tags`: fetching a contact's tags per card would be
+// an N+1 contact fetch across the whole board (see ghl.ts:108-110, the same
+// cost reason the list-view ApiLead omits attribution/tags). Tags belong to
+// the per-lead detail endpoint (Task 5), which fetches one contact at a time.
+
+interface GhlStage {
+  id: string;
+  name: string;
+}
+interface GhlPipeline {
+  id: string;
+  name: string;
+  stages?: GhlStage[];
+}
+interface PipelinesResponse {
+  pipelines: GhlPipeline[];
+}
+
+export interface ApiSetterLead {
+  id: string;
+  contactId: string;
+  name: string;
+  phone: string;
+  city: string;
+  stageName: string;
+  createdAt: string;
+  attempts: number;
+  firstDialedAt: string | null;
+  contacted: boolean;
+  lastOutcome: string | null;
+}
+
+// Pure: shape one live opportunity plus its already-computed dial roll-up
+// into a board card. No I/O, so this (and rollUpByContact, tested in
+// setterMetrics.test.ts) is the unit-testable core of the route.
+export function shapeSetterLead(
+  o: GhlOpportunity,
+  stageNames: Map<string, string>,
+  rollUps: Map<string, ContactRollUp>,
+): ApiSetterLead {
+  const contactId = o.contact?.id ?? o.contactId ?? "";
+  const fullName =
+    o.contact?.name ||
+    [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim();
+  const rollUp = rollUps.get(contactId);
+  return {
+    id: o.id,
+    contactId,
+    name: o.name || fullName || "Unknown",
+    phone: o.contact?.phone ?? "",
+    city: o.contact?.city ?? "",
+    stageName: stageNames.get(o.pipelineStageId ?? "") ?? "",
+    createdAt: o.createdAt ?? new Date().toISOString(),
+    attempts: rollUp?.attempts ?? 0,
+    firstDialedAt: rollUp?.firstDialedAt ?? null,
+    contacted: rollUp?.contacted ?? false,
+    lastOutcome: rollUp?.lastOutcome ?? null,
+  };
+}
+
+export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const url = new URL(ctx.request.url);
+  const tenantId = url.searchParams.get("tenantId");
+  const pipelineId = url.searchParams.get("pipelineId");
+  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
+  if (!pipelineId) return Response.json({ error: "missing_pipeline_id" }, { status: 400 });
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    // Stage names are resolved live, by id, from THIS tenant's pipeline list
+    // (never a hardcoded map): a stage rename in the CRM is reflected on the
+    // very next load.
+    const pipeData = await ghlJson<PipelinesResponse>(
+      gctx,
+      `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
+    );
+    const pipeline = (pipeData.pipelines ?? []).find((p) => p.id === pipelineId);
+    if (!pipeline) return Response.json({ error: "pipeline_not_found" }, { status: 404 });
+    const stageNames = new Map<string, string>();
+    for (const s of pipeline.stages ?? []) stageNames.set(s.id, s.name);
+
+    const truncated = { value: false };
+    const opps = await fetchAllOpportunities(gctx, { pipelineId, truncated });
+
+    const contactIds = [
+      ...new Set(opps.map((o) => o.contact?.id ?? o.contactId).filter((id): id is string => !!id)),
+    ];
+
+    let rollUps = new Map<string, ContactRollUp>();
+    if (contactIds.length) {
+      const client = getServiceClient(ctx.env);
+      if (client) {
+        const { data: dials, error } = await client
+          .from("setter_dials")
+          .select("contact_id, dialed_at, spoke, outcome")
+          .eq("tenant_id", tenantId)
+          .in("contact_id", contactIds);
+        if (error) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
+        rollUps = rollUpByContact((dials ?? []) as DialRow[]);
+      }
+    }
+
+    const leads = opps.map((o) => shapeSetterLead(o, stageNames, rollUps));
+
+    return Response.json({ leads, truncated: truncated.value });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/pipelines.test.ts b/command-center/app/functions/api/admin/setter/pipelines.test.ts
new file mode 100644
index 0000000..080b830
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/pipelines.test.ts
@@ -0,0 +1,50 @@
+import { describe, it, expect } from "vitest";
+import { shapeSetterPipeline } from "./pipelines";
+
+describe("shapeSetterPipeline", () => {
+  it("sorts stages by live position, not array order", () => {
+    const p = shapeSetterPipeline({
+      id: "p1",
+      name: "Lead Form Pipeline",
+      stages: [
+        { id: "s2", name: "Second", position: 1 },
+        { id: "s1", name: "First", position: 0 },
+      ],
+    });
+    expect(p.stages.map((s) => s.id)).toEqual(["s1", "s2"]);
+  });
+
+  it("flags a stage as needsDialing on a case-insensitive match anywhere in the name", () => {
+    const p = shapeSetterPipeline({
+      id: "p1",
+      name: "Funnel Pipeline",
+      stages: [
+        { id: "s1", name: "Survey Completed No Call Booked (needs dialing)", position: 0 },
+        { id: "s2", name: "NEEDS DIALING", position: 1 },
+        { id: "s3", name: "Survey Follow Up", position: 2 },
+      ],
+    });
+    expect(p.stages.find((s) => s.id === "s1")!.needsDialing).toBe(true);
+    expect(p.stages.find((s) => s.id === "s2")!.needsDialing).toBe(true);
+    expect(p.stages.find((s) => s.id === "s3")!.needsDialing).toBe(false);
+  });
+
+  it("carries the live stage color through unchanged", () => {
+    const p = shapeSetterPipeline({
+      id: "p1",
+      name: "Customers Pipeline",
+      stages: [{ id: "s1", name: "Recurring Customer", position: 0, color: "#16A34A" }],
+    });
+    expect(p.stages[0].color).toBe("#16A34A");
+  });
+
+  it("handles a pipeline with no stages at all", () => {
+    const p = shapeSetterPipeline({ id: "p1", name: "Empty", stages: [] });
+    expect(p.stages).toEqual([]);
+  });
+
+  it("handles a pipeline where stages is undefined", () => {
+    const p = shapeSetterPipeline({ id: "p1", name: "Empty" } as { id: string; name: string });
+    expect(p.stages).toEqual([]);
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/pipelines.ts b/command-center/app/functions/api/admin/setter/pipelines.ts
new file mode 100644
index 0000000..9313431
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/pipelines.ts
@@ -0,0 +1,77 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { ghlJson } from "../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+
+// GET /api/admin/setter/pipelines?tenantId= (admin-only, gated in
+// _middleware.ts). Every pipeline and stage for the client, resolved live
+// from the CRM, sorted, unfiltered. Feeds the Setter Suite board's pipeline
+// switcher.
+//
+// Unlike the client-facing PipelinesContext (functions/api/pipelines.ts),
+// which hides retired/system stages and pipelines from the client view, an
+// admin working the account cross-pipeline needs to see everything: Trash,
+// Cancelled Appointments, Google Reviews, Reactivation included. So nothing
+// here is filtered.
+
+interface GhlStage {
+  id: string;
+  name: string;
+  position: number;
+  color?: string;
+}
+interface GhlPipeline {
+  id: string;
+  name: string;
+  stages?: GhlStage[];
+}
+interface PipelinesResponse {
+  pipelines: GhlPipeline[];
+}
+
+export interface ApiSetterStage {
+  id: string;
+  name: string;
+  color?: string;
+  // True when the LIVE stage name matches /needs dialing/i. No mapping
+  // table: if the pipeline is renamed in the CRM this flag follows
+  // automatically, rather than silently going stale.
+  needsDialing: boolean;
+}
+
+export interface ApiSetterPipeline {
+  id: string;
+  name: string;
+  stages: ApiSetterStage[];
+}
+
+// Pure: sort a pipeline's stages by their live `position` and flag which ones
+// need a dial. No I/O, so this is the unit-testable core of the route.
+export function shapeSetterPipeline(p: GhlPipeline): ApiSetterPipeline {
+  const stages = [...(p.stages ?? [])]
+    .sort((a, b) => a.position - b.position)
+    .map((s) => ({
+      id: s.id,
+      name: s.name,
+      color: s.color,
+      needsDialing: /needs dialing/i.test(s.name),
+    }));
+  return { id: p.id, name: p.name, stages };
+}
+
+export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
+  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+    const data = await ghlJson<PipelinesResponse>(
+      gctx,
+      `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
+    );
+    const pipelines = (data.pipelines ?? []).map(shapeSetterPipeline);
+    return Response.json({ pipelines });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/slots.test.ts b/command-center/app/functions/api/admin/setter/slots.test.ts
new file mode 100644
index 0000000..67b1bcc
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/slots.test.ts
@@ -0,0 +1,69 @@
+import { describe, it, expect } from "vitest";
+import { parseSlotsQuery } from "./slots";
+
+// parseSlotsQuery is the only pure logic in this route (the rest is a live
+// CRM round-trip), so this covers every 400 path plus the days clamp before
+// a request ever reaches the calendars API.
+
+function qs(pairs: Record<string, string>): URLSearchParams {
+  return new URLSearchParams(pairs);
+}
+
+describe("parseSlotsQuery", () => {
+  it("requires tenantId", () => {
+    const r = parseSlotsQuery(qs({ calendarName: "Home Estimate" }));
+    expect(r.ok).toBe(false);
+    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
+  });
+
+  it("requires calendarName", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1" }));
+    expect(r.ok).toBe(false);
+    if (!r.ok) expect(r.code).toBe("missing_calendar_name");
+  });
+
+  it("rejects a blank calendarName", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "   " }));
+    expect(r.ok).toBe(false);
+    if (!r.ok) expect(r.code).toBe("missing_calendar_name");
+  });
+
+  it("defaults days to 14 when absent", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(14);
+  });
+
+  it("falls back to 14 when days is 0, matching the client-facing endpoint's falsy-catch behavior", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "0" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(14);
+  });
+
+  it("clamps a negative days value up to 1", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "-5" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(1);
+  });
+
+  it("clamps days above 31 down to 31", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "90" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(31);
+  });
+
+  it("falls back to 14 when days is not a number", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "abc" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(14);
+  });
+
+  it("trims tenantId and calendarName", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "  t1  ", calendarName: "  Home Estimate  " }));
+    expect(r.ok).toBe(true);
+    if (r.ok) {
+      expect(r.query.tenantId).toBe("t1");
+      expect(r.query.calendarName).toBe("Home Estimate");
+    }
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/slots.ts b/command-center/app/functions/api/admin/setter/slots.ts
new file mode 100644
index 0000000..7cd59fd
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/slots.ts
@@ -0,0 +1,95 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { tenantTimezone } from "../../../lib/env";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { resolveCalendarByName, getFreeSlots } from "../../lib/appointments";
+
+// GET /api/admin/setter/slots?tenantId=&calendarName=&days= (admin-only,
+// gated in _middleware.ts). Live free-slot lookup for the booking panel: a
+// setter who has someone on the phone picks a calendar by NAME (never a
+// hardcoded id, which differs per client) and sees real open windows before
+// offering a time. Read-only, so unlike book.ts this is safe to hit
+// repeatedly while the setter narrows down a slot.
+//
+// Reuses resolveCalendarByName + getFreeSlots from ../../lib/appointments
+// unchanged, including the calendars API's Version 2021-04-15 quirk baked
+// into that file's local calFetch.
+//
+// Degrades honestly: a round-robin calendar with no team members assigned
+// 422s "no team members" at the CRM; that is surfaced here as
+// needsStaff:true so the setter sees a plain "this calendar has no staff
+// assigned" message rather than an empty grid that reads as "nobody
+// available today". Those are different problems with different fixes.
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+export interface SlotsQuery {
+  tenantId: string;
+  calendarName: string;
+  days: number;
+}
+
+export type ParsedSlotsQuery =
+  | { ok: true; query: SlotsQuery }
+  | { ok: false; code: string };
+
+// Pure: validate + normalize the query params, including clamping days into
+// [1, 31] the same way the client-facing /api/appointments/slots does.
+// Unit-testable without a request.
+export function parseSlotsQuery(params: URLSearchParams): ParsedSlotsQuery {
+  const tenantId = params.get("tenantId");
+  if (!tenantId || !tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id" };
+  }
+  const calendarName = params.get("calendarName");
+  if (!calendarName || !calendarName.trim()) {
+    return { ok: false, code: "missing_calendar_name" };
+  }
+  const days = Math.min(Math.max(Number(params.get("days")) || 14, 1), 31);
+  return {
+    ok: true,
+    query: { tenantId: tenantId.trim(), calendarName: calendarName.trim(), days },
+  };
+}
+
+export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const url = new URL(ctx.request.url);
+  const parsed = parseSlotsQuery(url.searchParams);
+  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });
+  const { tenantId, calendarName, days } = parsed.query;
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    const calendarId = await resolveCalendarByName(gctx, calendarName);
+    if (!calendarId) {
+      return Response.json(
+        { error: "calendar_not_found", calendar: calendarName },
+        { status: 422 },
+      );
+    }
+
+    const now = Date.now();
+    const endMs = now + days * 24 * 60 * 60_000;
+    const timezone = tenantTimezone(ctx.env);
+
+    const result = await getFreeSlots(gctx, calendarId, now, endMs, timezone);
+    if (!result.ok) {
+      if (result.needsStaff) {
+        return Response.json({ error: "needs_staff" }, { status: 422 });
+      }
+      return Response.json(
+        { error: "ghl_error", status: result.status, body: result.body },
+        { status: 502 },
+      );
+    }
+
+    return Response.json({ ok: true, timezone, days: result.days });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/tags.test.ts b/command-center/app/functions/api/admin/setter/tags.test.ts
new file mode 100644
index 0000000..d1c3732
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/tags.test.ts
@@ -0,0 +1,45 @@
+import { describe, it, expect } from "vitest";
+import { validateTagsBody } from "./tags";
+
+// validateTagsBody is the only pure logic in this route (the rest is a live
+// CRM round-trip), so this covers every 400 path before a request ever
+// reaches the tags API.
+
+describe("validateTagsBody", () => {
+  it("requires tenantId and contactId", () => {
+    expect(validateTagsBody({ contactId: "c", add: ["x"] }).ok).toBe(false);
+    expect(validateTagsBody({ tenantId: "t", add: ["x"] }).ok).toBe(false);
+  });
+
+  it("rejects a body with neither add nor remove", () => {
+    const r = validateTagsBody({ tenantId: "t", contactId: "c" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("nothing_to_do");
+  });
+
+  it("rejects a body where add and remove are both empty arrays", () => {
+    const r = validateTagsBody({ tenantId: "t", contactId: "c", add: [], remove: [] });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("nothing_to_do");
+  });
+
+  it("rejects a body where add/remove contain only blank strings", () => {
+    const r = validateTagsBody({ tenantId: "t", contactId: "c", add: ["  ", ""] });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("nothing_to_do");
+  });
+
+  it("accepts add only", () => {
+    expect(validateTagsBody({ tenantId: "t", contactId: "c", add: ["hot lead"] }).ok).toBe(true);
+  });
+
+  it("accepts remove only", () => {
+    expect(validateTagsBody({ tenantId: "t", contactId: "c", remove: ["cold"] }).ok).toBe(true);
+  });
+
+  it("accepts both add and remove together", () => {
+    expect(
+      validateTagsBody({ tenantId: "t", contactId: "c", add: ["hot"], remove: ["cold"] }).ok,
+    ).toBe(true);
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/tags.ts b/command-center/app/functions/api/admin/setter/tags.ts
new file mode 100644
index 0000000..ea9fe63
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/tags.ts
@@ -0,0 +1,115 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { readJsonBody } from "../../../lib/body";
+import { ghlJson } from "../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { getServiceClient } from "../../../lib/supabase";
+import { logAdminAction } from "../../../lib/adminAuth";
+
+// POST /api/admin/setter/tags (admin-only, gated in _middleware.ts). Adds
+// and/or removes tags on a live CRM contact. These tags fire that client's
+// automations, so this is the riskiest write in the Setter Suite: it MUST
+// use getGhlContextForTenant (never resolveGhlCreds, which falls back to a
+// different, live production client's credentials on a half-configured
+// tenant) and it MUST re-read the contact after writing rather than echo the
+// request, so the setter sees what the CRM actually holds.
+//
+// ADD is proven live: POST /contacts/{id}/tags {"tags":[...]} -> 201,
+// tagsAdded (functions/api/reviews/index.ts:170 uses the same call style).
+// REMOVE is proven live too: DELETE /contacts/{id}/tags {"tags":[...]} ->
+// 200, tagsRemoved, confirmed gone on re-read. The GHL CLI's remove
+// (gohighlevel_cli.py) sends no body and silently drops its tags argument;
+// do not copy it.
+
+export interface TagsBody {
+  tenantId?: string;
+  contactId?: string;
+  add?: string[];
+  remove?: string[];
+}
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+// Trim and drop blanks; a caller that sends only whitespace tags has really
+// sent nothing.
+function cleanTags(list: string[] | undefined): string[] {
+  if (!Array.isArray(list)) return [];
+  return list.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
+}
+
+// Pure, split out so it is unit-testable without a request.
+export function validateTagsBody(body: TagsBody): ValidationResult {
+  if (!body.tenantId || !body.tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
+  }
+  if (!body.contactId || !body.contactId.trim()) {
+    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
+  }
+  if (cleanTags(body.add).length === 0 && cleanTags(body.remove).length === 0) {
+    return { ok: false, code: "nothing_to_do", error: "add or remove must contain at least one tag" };
+  }
+  return { ok: true };
+}
+
+interface GhlContactTagsResponse {
+  contact?: { tags?: string[] };
+}
+
+export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const body = await readJsonBody<TagsBody>(ctx.request);
+  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
+
+  const validation = validateTagsBody(body);
+  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
+
+  const tenantId = body.tenantId!.trim();
+  const contactId = body.contactId!.trim();
+  const add = cleanTags(body.add);
+  const remove = cleanTags(body.remove);
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    // Fixed order: remove first, then add. A tag present in both lists ends
+    // up added (add wins), rather than the outcome depending on request-body
+    // key order.
+    if (remove.length) {
+      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
+        method: "DELETE",
+        body: JSON.stringify({ tags: remove }),
+      });
+    }
+    if (add.length) {
+      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
+        method: "POST",
+        body: JSON.stringify({ tags: add }),
+      });
+    }
+
+    // Re-read so the setter sees what the CRM actually holds, not an echo of
+    // the request: these tags fire live automations, so the real state is
+    // what matters.
+    const data = await ghlJson<GhlContactTagsResponse>(
+      gctx,
+      `/contacts/${encodeURIComponent(contactId)}`,
+    );
+    const tags = data.contact?.tags ?? [];
+
+    const client = getServiceClient(ctx.env);
+    if (client) {
+      await logAdminAction(client, ctx.data.admin!.id, "setter.tags", tenantId, {
+        contactId,
+        add,
+        remove,
+      });
+    }
+
+    return Response.json({ tags });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/lib/ghl.test.ts b/command-center/app/functions/lib/ghl.test.ts
new file mode 100644
index 0000000..9f53ccf
--- /dev/null
+++ b/command-center/app/functions/lib/ghl.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi, afterEach } from "vitest";
+import { fetchAllOpportunities, type GhlContext } from "./ghl";
+
+// fetchAllOpportunities pages until either a short (natural last) page, or the
+// maxPages cap. Return value alone cannot distinguish "the tenant has exactly
+// maxPages*100 records and there truly is no more" from "there IS more but we
+// stopped fetching it": both leave `all.length === maxPages * 100`. The
+// optional `truncated` output parameter is the only honest way to tell the
+// two apart, so it is asserted directly here rather than inferred from length.
+
+afterEach(() => {
+  vi.unstubAllGlobals();
+});
+
+function jsonRes(data: unknown) {
+  return { ok: true, json: async () => data };
+}
+
+const ctx: GhlContext = { token: "tok", locationId: "loc-1" };
+
+function opp(id: string) {
+  return { id, contactId: `c-${id}`, pipelineStageId: "s1" };
+}
+
+describe("fetchAllOpportunities truncation reporting", () => {
+  it("does not report truncated when the last page is short", async () => {
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockResolvedValue(
+        jsonRes({
+          opportunities: [opp("1"), opp("2")],
+          meta: { total: 2 },
+        }),
+      ),
+    );
+
+    const truncated = { value: false };
+    const all = await fetchAllOpportunities(ctx, { maxPages: 10, truncated });
+
+    expect(all).toHaveLength(2);
+    expect(truncated.value).toBe(false);
+  });
+
+  it("does not report truncated when a full final page is genuinely the last (no next cursor)", async () => {
+    const fullPage = Array.from({ length: 100 }, (_, i) => opp(String(i)));
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockResolvedValue(
+        jsonRes({
+          opportunities: fullPage,
+          // No nextPageUrl/startAfterId: this really is the last page even
+          // though it is full.
+          meta: { total: 100 },
+        }),
+      ),
+    );
+
+    const truncated = { value: false };
+    const all = await fetchAllOpportunities(ctx, { maxPages: 10, truncated });
+
+    expect(all).toHaveLength(100);
+    expect(truncated.value).toBe(false);
+  });
+
+  it("reports truncated when pagination stops because maxPages was hit, not because data ran out", async () => {
+    let call = 0;
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockImplementation(async () => {
+        call += 1;
+        const page = Array.from({ length: 100 }, (_, i) => opp(`${call}-${i}`));
+        // Always claims there is a next page: the tenant genuinely has more
+        // than maxPages * 100 records.
+        return jsonRes({
+          opportunities: page,
+          meta: { startAfterId: `cursor-${call}`, startAfter: String(call) },
+        });
+      }),
+    );
+
+    const truncated = { value: false };
+    const all = await fetchAllOpportunities(ctx, { maxPages: 3, truncated });
+
+    expect(all).toHaveLength(300);
+    expect(truncated.value).toBe(true);
+  });
+
+  it("leaves an unsupplied truncated output alone (backward compatible for existing callers)", async () => {
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockResolvedValue(jsonRes({ opportunities: [opp("1")], meta: {} })),
+    );
+
+    // No truncated param passed: must not throw, matching every one of the
+    // 21 existing call sites that predate this option.
+    await expect(fetchAllOpportunities(ctx, { maxPages: 10 })).resolves.toHaveLength(1);
+  });
+});
diff --git a/command-center/app/functions/lib/ghl.ts b/command-center/app/functions/lib/ghl.ts
index f75ee65..43c31db 100644
--- a/command-center/app/functions/lib/ghl.ts
+++ b/command-center/app/functions/lib/ghl.ts
@@ -80,20 +80,24 @@ export interface GhlOpportunity {
   updatedAt?: string;
   lastStatusChangeAt?: string;
   contactId?: string;
   contact?: {
     id?: string;
     name?: string;
     firstName?: string;
     lastName?: string;
     email?: string;
     phone?: string;
+    // Present on some locations' opportunity search responses, absent on
+    // others; the Setter Suite board reads it for the lead card when GHL
+    // supplies it, and falls back to an empty string when it does not.
+    city?: string;
   };
   source?: string;
   // GHL user id this opportunity is assigned to (drives rep-only filtering).
   assignedTo?: string;
 }
 
 export interface ApiLead {
   id: string;
   name: string;
   phone: string;
@@ -122,21 +126,31 @@ interface OpportunitySearchResponse {
   };
 }
 
 // Paginated fetch of every opportunity for a location (optionally one
 // pipeline), capped at maxPages * 100. GHL's opportunities-search may return
 // either a full nextPageUrl (like contacts) or startAfterId / startAfter
 // cursor fields; both styles are handled. Used by the leads list and summary
 // so counts cover all opportunities, not page 1.
 export async function fetchAllOpportunities(
   ctx: GhlContext,
-  opts: { pipelineId?: string | null; maxPages?: number } = {},
+  opts: {
+    pipelineId?: string | null;
+    maxPages?: number;
+    // Output parameter: when supplied, its `.value` is set to true if
+    // pagination stopped because the maxPages cap was hit rather than
+    // because a real last page was reached. Optional and additive so every
+    // existing caller (21 across the app) is unaffected; only a caller that
+    // needs to tell an honest "there may be more" apart from "this is
+    // everything" passes it. See the Setter Suite leads endpoint.
+    truncated?: { value: boolean };
+  } = {},
 ): Promise<GhlOpportunity[]> {
   const maxPages = opts.maxPages ?? 10;
   const base = `/opportunities/search?location_id=${encodeURIComponent(ctx.locationId)}&limit=100${
     opts.pipelineId ? `&pipeline_id=${encodeURIComponent(opts.pipelineId)}` : ""
   }`;
 
   const all: GhlOpportunity[] = [];
   const seen = new Set<string>();
   let nextPageUrl: string | undefined;
   let startAfterId: string | undefined;
@@ -179,20 +193,21 @@ export async function fetchAllOpportunities(
       startAfter = nextTs;
     }
 
     pageCount += 1;
   }
 
   if (pageCount >= maxPages) {
     console.warn(
       `opportunity pagination hit maxPages cap for location ${ctx.locationId}`,
     );
+    if (opts.truncated) opts.truncated.value = true;
   }
 
   return all;
 }
 
 export interface GhlConversation {
   id: string;
   contactId?: string;
   fullName?: string;
   contactName?: string;
diff --git a/command-center/app/functions/lib/setterMetrics.test.ts b/command-center/app/functions/lib/setterMetrics.test.ts
new file mode 100644
index 0000000..0249e6f
--- /dev/null
+++ b/command-center/app/functions/lib/setterMetrics.test.ts
@@ -0,0 +1,117 @@
+import { describe, it, expect } from "vitest";
+import { rollUpByContact, computeRates } from "./setterMetrics";
+
+const dial = (contact: string, at: string, spoke: boolean, outcome: string) =>
+  ({ contact_id: contact, dialed_at: at, spoke, outcome });
+
+describe("rollUpByContact", () => {
+  it("counts attempts and takes the earliest dial as first call", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T14:00:00Z", false, "no_answer"),
+      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
+      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
+    ]);
+    expect(r.get("c1")!.attempts).toBe(3);
+    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
+  });
+
+  it("marks contacted when any dial spoke, regardless of order", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T09:00:00Z", true, "not_interested"),
+      dial("c1", "2026-07-20T10:00:00Z", false, "no_answer"),
+    ]);
+    expect(r.get("c1")!.contacted).toBe(true);
+  });
+
+  it("takes the outcome of the most recent dial, not the last in the array", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
+      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
+    ]);
+    expect(r.get("c1")!.lastOutcome).toBe("booked");
+  });
+
+  it("keeps contacts separate", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
+      dial("c2", "2026-07-20T09:00:00Z", false, "no_answer"),
+    ]);
+    expect(r.get("c1")!.contacted).toBe(true);
+    expect(r.get("c2")!.contacted).toBe(false);
+  });
+
+  it("orders by real instant, not string, across mixed UTC-offset representations", () => {
+    // "2026-07-20T23:00:00-04:00" is 2026-07-21T03:00:00Z: chronologically LATER
+    // than "2026-07-21T00:30:00Z", even though its string sorts EARLIER (the
+    // "20" before "21"). A raw string compare would pick this row as the
+    // earliest dial and its outcome as the latest one; both are wrong.
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T23:00:00-04:00", false, "no_answer"),
+      dial("c1", "2026-07-21T00:30:00Z", true, "booked"),
+    ]);
+    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-21T00:30:00Z");
+    expect(r.get("c1")!.lastOutcome).toBe("no_answer");
+  });
+
+  it("treats an unparseable dialed_at as attempted but does not let it win ordering over a real timestamp", () => {
+    const r = rollUpByContact([
+      dial("c1", "not-a-date", false, "no_answer"),
+      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
+    ]);
+    expect(r.get("c1")!.attempts).toBe(2);
+    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
+    expect(r.get("c1")!.lastOutcome).toBe("booked");
+  });
+
+  it("falls back to the raw value when no dial for a contact has a parseable timestamp", () => {
+    const r = rollUpByContact([dial("c1", "", false, "no_answer")]);
+    expect(r.get("c1")!.attempts).toBe(1);
+    expect(r.get("c1")!.firstDialedAt).toBe("");
+    expect(r.get("c1")!.lastOutcome).toBe("no_answer");
+  });
+});
+
+describe("computeRates", () => {
+  it("returns null rates rather than NaN when there are no leads", () => {
+    const r = computeRates([], new Map(), []);
+    expect(r.totalLeads).toBe(0);
+    expect(r.contactRate).toBeNull();
+    expect(r.bookingRate).toBeNull();
+  });
+
+  it("counts a lead as contacted only via its own roll-up", () => {
+    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
+    const rollUps = rollUpByContact([dial("c1", "2026-07-20T09:00:00Z", true, "booked")]);
+    const r = computeRates(leads, rollUps, []);
+    expect(r.totalLeads).toBe(2);
+    expect(r.contactRate).toBeCloseTo(0.5);
+  });
+
+  it("never computes show or close rate", () => {
+    const r = computeRates([{ contactId: "c1" }], new Map(), [{ contactId: "c1" }]);
+    expect(r.showRate).toBeNull();
+    expect(r.closeRate).toBeNull();
+  });
+
+  it("pins bookingRate to a real fraction of leads booked", () => {
+    const leads = [{ contactId: "c1" }, { contactId: "c2" }, { contactId: "c3" }];
+    const r = computeRates(leads, new Map(), [{ contactId: "c2" }]);
+    expect(r.bookingRate).toBeCloseTo(1 / 3);
+  });
+
+  it("uses lead count as the bookingRate denominator, not appointment count", () => {
+    // Three appointments land, but only one lead. If the denominator were
+    // accidentally the appointment count, this would compute 1/3 instead of 1.
+    const leads = [{ contactId: "c1" }];
+    const appointments = [{ contactId: "c1" }, { contactId: "c2" }, { contactId: "c3" }];
+    const r = computeRates(leads, new Map(), appointments);
+    expect(r.bookingRate).toBe(1);
+  });
+
+  it("does not let an appointment for a non-lead contact inflate bookingRate", () => {
+    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
+    const appointments = [{ contactId: "c2" }, { contactId: "not-a-lead" }];
+    const r = computeRates(leads, new Map(), appointments);
+    expect(r.bookingRate).toBeCloseTo(0.5);
+  });
+});
diff --git a/command-center/app/functions/lib/setterMetrics.ts b/command-center/app/functions/lib/setterMetrics.ts
new file mode 100644
index 0000000..2996426
--- /dev/null
+++ b/command-center/app/functions/lib/setterMetrics.ts
@@ -0,0 +1,97 @@
+export type DialRow = {
+  contact_id: string;
+  dialed_at: string;
+  spoke: boolean;
+  outcome: string;
+};
+
+export type ContactRollUp = {
+  attempts: number;
+  firstDialedAt: string | null;
+  contacted: boolean;
+  lastOutcome: string | null;
+};
+
+// dialed_at comes from a Postgres timestamptz via Supabase. Unlike
+// adTrackerMetrics's inRange (which only ever needs the first ten characters
+// of a date, a bucket coarse enough that offset representation cannot flip
+// the answer), here we need true chronological order down to the instant, so
+// a string compare is not safe: "2026-07-20T23:00:00-04:00" (which is
+// 2026-07-21T03:00:00Z) sorts as a LESSER string than "2026-07-21T00:30:00Z"
+// even though it is the LATER instant. Comparing parsed epoch milliseconds
+// instead makes the offset irrelevant. An unparseable or empty timestamp
+// parses to NaN; it is kept (so attempts/outcome are never dropped) but is
+// never allowed to out-rank a real, parseable timestamp for first/last
+// ordering, since we have no way to know where in time it actually belongs.
+function epochOf(iso: string): number {
+  return Date.parse(iso);
+}
+
+export function rollUpByContact(dials: DialRow[]): Map<string, ContactRollUp> {
+  const out = new Map<string, ContactRollUp>();
+  // Input sort order is not trusted, so the earliest/latest timestamp per
+  // contact is tracked alongside (as epoch ms) rather than assumed from
+  // array position or derived by re-parsing the stored strings.
+  const firstAt = new Map<string, number>();
+  const latestAt = new Map<string, number>();
+
+  for (const d of dials) {
+    const cur = out.get(d.contact_id) ?? {
+      attempts: 0, firstDialedAt: null, contacted: false, lastOutcome: null,
+    };
+    cur.attempts += 1;
+
+    const epoch = epochOf(d.dialed_at);
+    const firstEpoch = firstAt.get(d.contact_id);
+    if (
+      cur.firstDialedAt === null
+      || (!Number.isNaN(epoch) && (firstEpoch === undefined || Number.isNaN(firstEpoch) || epoch < firstEpoch))
+    ) {
+      cur.firstDialedAt = d.dialed_at;
+      firstAt.set(d.contact_id, epoch);
+    }
+
+    const seenEpoch = latestAt.get(d.contact_id);
+    if (
+      seenEpoch === undefined
+      || (!Number.isNaN(epoch) && (Number.isNaN(seenEpoch) || epoch >= seenEpoch))
+    ) {
+      cur.lastOutcome = d.outcome;
+      latestAt.set(d.contact_id, epoch);
+    }
+
+    if (d.spoke) cur.contacted = true;
+    out.set(d.contact_id, cur);
+  }
+  return out;
+}
+
+export type Rates = {
+  totalLeads: number;
+  contactRate: number | null;
+  bookingRate: number | null;
+  showRate: null;
+  closeRate: null;
+};
+
+export function computeRates(
+  leads: { contactId: string }[],
+  rollUps: Map<string, ContactRollUp>,
+  appointments: { contactId: string }[],
+): Rates {
+  const total = leads.length;
+  if (total === 0) {
+    return { totalLeads: 0, contactRate: null, bookingRate: null, showRate: null, closeRate: null };
+  }
+  const contacted = leads.filter((l) => rollUps.get(l.contactId)?.contacted).length;
+  const booked = new Set(appointments.map((a) => a.contactId));
+  const bookedLeads = leads.filter((l) => booked.has(l.contactId)).length;
+  return {
+    totalLeads: total,
+    contactRate: contacted / total,
+    bookingRate: bookedLeads / total,
+    // Both require the Estimate and Job Close-out flows, which do not exist.
+    showRate: null,
+    closeRate: null,
+  };
+}
diff --git a/command-center/app/functions/lib/tenantGhl.test.ts b/command-center/app/functions/lib/tenantGhl.test.ts
new file mode 100644
index 0000000..64a415b
--- /dev/null
+++ b/command-center/app/functions/lib/tenantGhl.test.ts
@@ -0,0 +1,17 @@
+import { describe, it, expect } from "vitest";
+import { isPlaceholder } from "./tenantGhl";
+
+describe("isPlaceholder", () => {
+  it("rejects the three known placeholder values", () => {
+    expect(isPlaceholder("")).toBe(true);
+    expect(isPlaceholder("pending")).toBe(true);
+    expect(isPlaceholder("env")).toBe(true);
+  });
+  it("accepts a real value", () => {
+    expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
+  });
+  it("treats null and undefined as placeholder", () => {
+    expect(isPlaceholder(null)).toBe(true);
+    expect(isPlaceholder(undefined)).toBe(true);
+  });
+});
diff --git a/command-center/app/functions/lib/tenantGhl.ts b/command-center/app/functions/lib/tenantGhl.ts
new file mode 100644
index 0000000..bde08d0
--- /dev/null
+++ b/command-center/app/functions/lib/tenantGhl.ts
@@ -0,0 +1,52 @@
+import type { Env } from "./env";
+import { getServiceClient } from "./supabase";
+import type { GhlContext } from "./ghl";
+
+const PLACEHOLDERS = new Set(["", "pending", "env"]);
+
+export function isPlaceholder(v: string | null | undefined): boolean {
+  return v == null || PLACEHOLDERS.has(v.trim().toLowerCase());
+}
+
+export class TenantGhlError extends Error {
+  constructor(readonly status: number, readonly code: string, message: string) {
+    super(message);
+  }
+}
+
+// Admin routes run above tenant resolution (functions/api/_middleware.ts:87-100),
+// so ctx.data.tenant is never populated. This is the one place that turns a
+// tenantId into a usable GHL context for those routes. Note getTenantById in
+// adminAuth.ts deliberately omits ghl_token, so it cannot be used here.
+//
+// Deliberate divergence from resolveGhlCreds in tenantResolve.ts: that helper
+// falls back to the GHL_LOCATION_ID / GHL_TOKEN env vars when a tenant's stored
+// creds are placeholders, because it backs the live client app where "show the
+// env sub-account" is an acceptable degrade. The env vars hold a real
+// production client's credentials. Admin tooling built on this helper (the
+// Setter Suite client switcher) WRITES: it applies tags that fire live
+// automations. If an admin picked a half-configured client and this fell back
+// to the env creds, it would silently tag a different client's real customers.
+// So this throws instead of falling back. Do not change this to match
+// resolveGhlCreds; the two helpers serve different trust boundaries on
+// purpose.
+export async function getGhlContextForTenant(env: Env, tenantId: string): Promise<GhlContext> {
+  const client = getServiceClient(env);
+  // getServiceClient returns null when Supabase env vars are unset. Every
+  // current caller already checks this itself before reaching here, but
+  // TypeScript cannot see that, and a future caller might not: fail loudly
+  // rather than crash on client.from below.
+  if (!client) throw new TenantGhlError(503, "supabase_not_configured", "Client data is not available right now.");
+  const { data, error } = await client
+    .from("tenants")
+    .select("ghl_location_id, ghl_token")
+    .eq("id", tenantId)
+    .maybeSingle();
+
+  if (error) throw new TenantGhlError(500, "tenant_lookup_failed", error.message);
+  if (!data) throw new TenantGhlError(404, "tenant_not_found", "No such client.");
+  if (isPlaceholder(data.ghl_location_id) || isPlaceholder(data.ghl_token)) {
+    throw new TenantGhlError(400, "ghl_not_connected", "Connect this client to the booking system first.");
+  }
+  return { token: data.ghl_token, locationId: data.ghl_location_id };
+}
diff --git a/command-center/app/src/App.tsx b/command-center/app/src/App.tsx
index 2a357ed..0b84ced 100644
--- a/command-center/app/src/App.tsx
+++ b/command-center/app/src/App.tsx
@@ -53,20 +53,21 @@ import OutreachEmails from "./routes/outreach/OutreachEmails";
 import OutreachData from "./routes/outreach/OutreachData";
 import OutreachSms from "./routes/outreach/OutreachSms";
 import ReactivationPipeline from "./routes/reactivation/ReactivationPipeline";
 import ReactivationData from "./routes/reactivation/ReactivationData";
 import GroupOutreachOverview from "./routes/groups/GroupOutreachOverview";
 import AdminLayout from "./routes/admin/AdminLayout";
 import AdminClientDetail from "./routes/admin/AdminClientDetail";
 import AdminCommand from "./routes/admin/AdminCommand";
 import AdminDelivery from "./routes/admin/AdminDelivery";
 import DeliveryCockpit from "./routes/admin/DeliveryCockpit";
+import SetterSuite from "./routes/admin/SetterSuite";
 import PillarPage from "./routes/admin/PillarPage";
 import AdminSettings from "./routes/admin/AdminSettings";
 import Shell from "./components/Shell";
 import IdentityPicker from "./components/IdentityPicker";
 import OfflineBanner from "./components/OfflineBanner";
 import PreviewBanner from "./components/PreviewBanner";
 import { isPreviewFrame } from "./lib/previewFrame";
 import DemoBanner from "./components/DemoBanner";
 import IncomingCallBanner from "./components/call/IncomingCallBanner";
 import ScrollToTop from "./components/ScrollToTop";
@@ -551,20 +552,30 @@ export default function App() {
                 }
               />
               <Route
                 path="/admin/delivery/:tenantId"
                 element={
                   <AdminRoute>
                     <DeliveryCockpit />
                   </AdminRoute>
                 }
               />
+              {/* Sales: the Setter Suite, one client's leads worked across
+                  every one of that client's pipelines. */}
+              <Route
+                path="/admin/setter"
+                element={
+                  <AdminRoute>
+                    <SetterSuite />
+                  </AdminRoute>
+                }
+              />
               <Route
                 path="/admin/settings"
                 element={
                   <AdminRoute>
                     <AdminSettings />
                   </AdminRoute>
                 }
               />
               {/* Legacy 6-pillar ids fold into the new 4-pillar spine. Static
                   segments out-rank the :pillarId route, so these win. */}
diff --git a/command-center/app/src/components/admin/SetterRateStrip.tsx b/command-center/app/src/components/admin/SetterRateStrip.tsx
new file mode 100644
index 0000000..b4aca61
--- /dev/null
+++ b/command-center/app/src/components/admin/SetterRateStrip.tsx
@@ -0,0 +1,41 @@
+import { computeSetterRateStrip } from "../../lib/setterRates";
+import type { ApiSetterLead } from "../../lib/api";
+
+interface Props {
+  leads: ApiSetterLead[];
+}
+
+// The Setter Suite's headline rate strip (Task 9): five tiles, in the exact
+// order and wording the client specified. Lives outside
+// src/components/admin/setter/ deliberately: two other fix tasks are editing
+// that folder concurrently.
+//
+// Show rate and Close rate have no data behind them yet (they need the
+// Estimate and Job close-out flows, which do not exist), so they always
+// render with the shared `.pk-report-tile.pk-pending` treatment instead of a
+// number. A synthetic zero here would read as "our show rate is 0 percent",
+// a catastrophe, when the truth is "we are not measuring this yet." Contact
+// rate and Booking rate get the same pending treatment for the narrower case
+// of a zero-lead denominator, since 0/0 is undefined, not 0.
+//
+// All the math is pure and unit-tested in src/lib/setterRates.ts; this
+// component only renders what that function returns.
+export default function SetterRateStrip({ leads }: Props) {
+  const tiles = computeSetterRateStrip(
+    leads.map((l) => ({ contacted: l.contacted, lastOutcome: l.lastOutcome })),
+  );
+
+  return (
+    <div className="pk-report" aria-label="Headline rates">
+      {tiles.map((tile) => (
+        <div key={tile.key} className={`pk-report-tile${tile.pending ? " pk-pending" : ""}`}>
+          <div className={`pk-report-val font-data${tile.pending ? "" : " tabular-figs"}`}>
+            {tile.pending ? tile.pendingReason : tile.value}
+          </div>
+          <div className="pk-report-label">{tile.label}</div>
+          <div className="mt-1.5 font-data text-[10.5px] text-faint">{tile.formula}</div>
+        </div>
+      ))}
+    </div>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/DialLogger.tsx b/command-center/app/src/components/admin/setter/DialLogger.tsx
new file mode 100644
index 0000000..d204638
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/DialLogger.tsx
@@ -0,0 +1,145 @@
+import { useState } from "react";
+import { Loader2, Phone, PhoneOff } from "lucide-react";
+import { useLogSetterDial } from "../../../hooks/useApi";
+import { useToast } from "../../../context/ToastContext";
+import { Switch } from "../../ui/Switch";
+import {
+  OUTCOMES,
+  defaultSpokeForOutcome,
+  isContradictoryDial,
+  type SetterOutcome,
+} from "../../../lib/setterCockpit";
+import type { ApiSetterLead } from "../../../lib/api";
+
+interface Props {
+  tenantId: string;
+  pipelineId: string;
+  pipelineName: string;
+  lead: ApiSetterLead;
+}
+
+// Log this call: the five outcome buttons, a spoke override, and an
+// optional note, submitted together as one setter_dials row. Picking an
+// outcome sets spoke to the server's own default (functions/api/admin/setter
+// /dials.ts:validateDialBody rejects no_answer + spoke:true as
+// "contradictory") so the common path never needs the override touched; the
+// toggle stays visible for the setter to correct a default that does not
+// match what actually happened on the call.
+export default function DialLogger({ tenantId, pipelineId, pipelineName, lead }: Props) {
+  const { showToast } = useToast();
+  const logDial = useLogSetterDial();
+
+  const [outcome, setOutcome] = useState<SetterOutcome | null>(null);
+  const [spoke, setSpoke] = useState(true);
+  const [note, setNote] = useState("");
+
+  const pickOutcome = (value: SetterOutcome) => {
+    setOutcome(value);
+    setSpoke(defaultSpokeForOutcome(value));
+  };
+
+  const contradictory = outcome !== null && isContradictoryDial(outcome, spoke);
+  const canSubmit = outcome !== null && !contradictory && !logDial.isPending;
+
+  const submit = () => {
+    if (!outcome || contradictory) return;
+    const outcomeDef = OUTCOMES.find((o) => o.value === outcome);
+    logDial.mutate(
+      {
+        tenantId,
+        pipelineId,
+        leadId: lead.id,
+        contactId: lead.contactId,
+        opportunityId: lead.id,
+        pipelineName,
+        stageName: lead.stageName,
+        spoke,
+        outcome,
+        note: note.trim() ? note.trim() : null,
+      },
+      {
+        onSuccess: () => {
+          showToast(`Logged: ${outcomeDef?.label ?? outcome}`);
+          setOutcome(null);
+          setSpoke(true);
+          setNote("");
+        },
+        onError: (err) => {
+          const body =
+            err && typeof err === "object" && "body" in err
+              ? (err as { body?: { error?: string } }).body
+              : null;
+          if (body?.error === "contradictory") {
+            showToast(
+              "No answer cannot be logged as spoke with. Turn off the spoke override or pick a different outcome.",
+            );
+          } else {
+            showToast("Could not log that call, please try again");
+          }
+        },
+      },
+    );
+  };
+
+  return (
+    <div className="flex flex-col gap-3">
+      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
+        {OUTCOMES.map((o) => {
+          const on = outcome === o.value;
+          return (
+            <button
+              key={o.value}
+              type="button"
+              onClick={() => pickOutcome(o.value)}
+              className={
+                "rounded-[var(--radius)] border px-3 py-2.5 text-left font-display text-[13px] font-semibold transition-colors " +
+                (on
+                  ? "border-brand bg-brand-tint text-brand-text"
+                  : "border-border bg-surface text-text hover:border-brand/40")
+              }
+            >
+              {o.label}
+            </button>
+          );
+        })}
+      </div>
+
+      <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5">
+        <span className="flex items-center gap-2 text-[13px] font-medium text-text">
+          {spoke ? (
+            <Phone size={14} className="text-positive" aria-hidden />
+          ) : (
+            <PhoneOff size={14} className="text-faint" aria-hidden />
+          )}
+          Spoke with them
+        </span>
+        <Switch checked={spoke} onChange={setSpoke} label="Spoke with them" />
+      </div>
+
+      {contradictory && (
+        <p className="text-[12px] font-medium text-danger">
+          No answer cannot be paired with Spoke with them. Turn the toggle off or pick a
+          different outcome.
+        </p>
+      )}
+
+      <textarea
+        value={note}
+        onChange={(e) => setNote(e.target.value)}
+        placeholder="Note about this call (optional)"
+        className="min-h-[64px] w-full resize-y rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50"
+      />
+
+      <button
+        type="button"
+        onClick={submit}
+        disabled={!canSubmit}
+        className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
+        style={{ backgroundImage: "var(--grad-brand)" }}
+      >
+        {logDial.isPending && <Loader2 size={14} className="animate-spin" />}
+        {logDial.isPending ? "Logging..." : "Log dial"}
+      </button>
+    </div>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/SetterBoard.tsx b/command-center/app/src/components/admin/setter/SetterBoard.tsx
new file mode 100644
index 0000000..239c7e0
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SetterBoard.tsx
@@ -0,0 +1,112 @@
+import { useMemo } from "react";
+import { AlertTriangle } from "lucide-react";
+import SetterCard from "./SetterCard";
+import type { ApiSetterLead, ApiSetterPipeline } from "../../../lib/api";
+
+interface Props {
+  pipeline: ApiSetterPipeline;
+  leads: ApiSetterLead[];
+  truncated: boolean;
+  now: number;
+  selectedLeadId: string | null;
+  onSelectLead: (lead: ApiSetterLead) => void;
+}
+
+// One pipeline's stage columns, real GHL stage names verbatim, structured
+// exactly like the client-facing kanban (src/components/Board.tsx): a dot +
+// name + count header, a needs-dialing chip under flagged stages, and a
+// rounded well of cards. Unlike that board this one never hides a stage or a
+// pipeline, and it groups by stage NAME (ApiSetterLead has no stage id, only
+// stageName, since the leads endpoint resolves it live per lead).
+export default function SetterBoard({
+  pipeline,
+  leads,
+  truncated,
+  now,
+  selectedLeadId,
+  onSelectLead,
+}: Props) {
+  const byStage = useMemo(() => {
+    const m = new Map<string, ApiSetterLead[]>();
+    for (const s of pipeline.stages) m.set(s.name, []);
+    for (const l of leads) {
+      const list = m.get(l.stageName);
+      // A lead whose stage name has no matching column (stale cache, a stage
+      // renamed between the pipeline and lead fetch) is dropped from the
+      // board rather than crashing it; the count in its real stage stays
+      // accurate for everything else.
+      if (list) list.push(l);
+    }
+    return m;
+  }, [leads, pipeline.stages]);
+
+  return (
+    <div className="pt-2">
+      {truncated && (
+        <div className="mx-1 mb-3 flex items-center gap-2 rounded-xl border border-warning/35 bg-warning-tint px-3 py-2 text-[12.5px] font-semibold text-warning">
+          <AlertTriangle size={14} aria-hidden />
+          Showing the first 1,000 leads in this pipeline. There are more that are not shown here.
+        </div>
+      )}
+
+      <div className="no-scrollbar flex items-start gap-3 overflow-x-auto pb-2">
+        {pipeline.stages.map((stage) => {
+          const items = byStage.get(stage.name) ?? [];
+          return (
+            <section key={stage.id} className="flex w-[280px] shrink-0 flex-col gap-2">
+              <header className="flex items-baseline justify-between gap-2 px-1">
+                <span className="flex min-w-0 items-center gap-1.5">
+                  {stage.color && (
+                    <span
+                      className="h-2 w-2 shrink-0 rounded-full"
+                      style={{ background: stage.color }}
+                      aria-hidden
+                    />
+                  )}
+                  <span
+                    className="truncate font-display text-[14px] font-bold text-text"
+                    title={stage.name}
+                  >
+                    {stage.name}
+                  </span>
+                </span>
+                <span className="font-data shrink-0 text-[12px] font-semibold text-muted">
+                  {items.length}
+                </span>
+              </header>
+
+              {stage.needsDialing && (
+                <div className="px-1">
+                  <span className="inline-flex items-center rounded-full bg-warning-tint px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
+                    Needs dialing
+                  </span>
+                </div>
+              )}
+
+              <div className="flex min-h-[96px] flex-col gap-2 rounded-2xl bg-surface-2 p-2">
+                {items.length === 0 ? (
+                  <p className="px-2 py-6 text-center text-[12px] text-faint">
+                    {stage.needsDialing
+                      ? "No leads waiting on a dial."
+                      : "No leads in this stage yet."}
+                  </p>
+                ) : (
+                  items.map((lead) => (
+                    <SetterCard
+                      key={lead.id}
+                      lead={lead}
+                      stageNeedsDialing={stage.needsDialing}
+                      now={now}
+                      selected={lead.id === selectedLeadId}
+                      onSelect={onSelectLead}
+                    />
+                  ))
+                )}
+              </div>
+            </section>
+          );
+        })}
+      </div>
+    </div>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/SetterCard.tsx b/command-center/app/src/components/admin/setter/SetterCard.tsx
new file mode 100644
index 0000000..0e29cea
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SetterCard.tsx
@@ -0,0 +1,73 @@
+import { cardRail, formatOutcome, staleWaitingLabel } from "../../../lib/setterModel";
+import { timeAgo } from "../../../lib/timeAgo";
+import type { ApiSetterLead } from "../../../lib/api";
+
+interface Props {
+  lead: ApiSetterLead;
+  stageNeedsDialing: boolean;
+  now: number;
+  selected: boolean;
+  onSelect: (lead: ApiSetterLead) => void;
+}
+
+// One board card. Deliberately does not open anything: the lead detail
+// cockpit is a separate, later task. This just tracks selection and calls
+// back, the seam that task hooks into.
+export default function SetterCard({ lead, stageNeedsDialing, now, selected, onSelect }: Props) {
+  const rail = cardRail(lead, stageNeedsDialing, now);
+
+  // Composed by hand rather than via Tailwind box-shadow utility classes,
+  // because the rail and the selection ring can both be present at once and
+  // only the last box-shadow class wins when two are applied via className.
+  const shadows: string[] = [];
+  if (rail === "danger") shadows.push("inset 3px 0 0 var(--danger)");
+  else if (rail === "warning") shadows.push("inset 3px 0 0 var(--warning)");
+  if (selected) shadows.push("0 0 0 2px var(--brand)");
+  const style = shadows.length ? { boxShadow: shadows.join(", ") } : undefined;
+
+  return (
+    <button
+      type="button"
+      onClick={() => onSelect(lead)}
+      style={style}
+      className={
+        "relative w-full overflow-hidden rounded-xl border bg-surface p-3 text-left transition-colors " +
+        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 " +
+        (selected ? "border-brand" : "border-border")
+      }
+    >
+      <div className="truncate font-display text-[13.5px] font-semibold text-text">{lead.name}</div>
+      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-faint">
+        <span className="font-data truncate">{lead.city || "City unknown"}</span>
+        <span className="opacity-50">·</span>
+        <span className="font-data shrink-0">{timeAgo(lead.createdAt, now)}</span>
+      </div>
+      <div className="mt-2 flex flex-wrap items-center gap-1.5">
+        {lead.attempts > 0 ? (
+          <span className="font-data rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
+            {lead.attempts} {lead.attempts === 1 ? "dial" : "dials"}
+          </span>
+        ) : (
+          <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-danger">
+            Never dialed
+          </span>
+        )}
+        {rail === "warning" && (
+          <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-warning">
+            {staleWaitingLabel(lead.createdAt, now)}
+          </span>
+        )}
+        {lead.contacted && (
+          <span className="rounded-full bg-positive-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-positive">
+            Spoke
+          </span>
+        )}
+        {lead.lastOutcome && (
+          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted">
+            {formatOutcome(lead.lastOutcome)}
+          </span>
+        )}
+      </div>
+    </button>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/SetterCockpit.tsx b/command-center/app/src/components/admin/setter/SetterCockpit.tsx
new file mode 100644
index 0000000..bc90e76
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SetterCockpit.tsx
@@ -0,0 +1,200 @@
+import { Mail, Phone, TriangleAlert, X } from "lucide-react";
+import Avatar from "../../Avatar";
+import DialLogger from "./DialLogger";
+import TagField from "./TagField";
+import SlotPicker from "./SlotPicker";
+import { Button } from "../../ui/Button";
+import { useSetterLeadDetailQuery } from "../../../hooks/useApi";
+import { useNow } from "../../../context/NowContext";
+import { e164, formatPhone } from "../../../lib/phone";
+import { timeAgo } from "../../../lib/timeAgo";
+import { formatOutcome } from "../../../lib/setterModel";
+import { isOptimisticDial } from "../../../lib/setterCockpit";
+import type { ApiSetterLead } from "../../../lib/api";
+
+interface Props {
+  tenantId: string;
+  pipelineId: string;
+  pipelineName: string;
+  lead: ApiSetterLead;
+  onClose: () => void;
+}
+
+function Section({ title, children }: { title: string; children: React.ReactNode }) {
+  return (
+    <section className="border-t border-divider px-4 py-4 first:border-t-0">
+      <h3 className="label-cap mb-2.5 text-faint">{title}</h3>
+      {children}
+    </section>
+  );
+}
+
+// Shown in place of tags/history when the per-lead detail fetch itself
+// failed, so a request that never landed cannot be mistaken for a contact
+// with no tags or no calls. Mirrors ActivityDesktop's FeedError: a danger-
+// tinted panel naming what broke plus a Retry button, sized down for this
+// docked panel's narrower columns.
+function DetailLoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
+  return (
+    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-3 py-2.5">
+      <p className="flex items-start gap-1.5 text-[12.5px] text-danger">
+        <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
+        Could not load {what}.
+      </p>
+      <Button variant="secondary" size="sm" onClick={onRetry}>
+        Retry
+      </Button>
+    </div>
+  );
+}
+
+// The lead cockpit: one selected lead's live identity, the call-logging
+// form, tags, booking, and history, docked to the right of the board
+// (src/routes/admin/SetterSuite.tsx). Reads its own detail off
+// contactId (tags + full dial history are only on this per-lead endpoint,
+// never the board list, see functions/api/admin/setter/lead/[contactId].ts),
+// falling back to the board card's own fields while that request is in
+// flight or if it errors, so switching leads never shows a blank panel.
+export default function SetterCockpit({ tenantId, pipelineId, pipelineName, lead, onClose }: Props) {
+  const now = useNow();
+  const detailQuery = useSetterLeadDetailQuery(tenantId, lead.contactId, true);
+  const detail = detailQuery.data?.lead;
+
+  const name = detail?.name || lead.name;
+  const phone = detail?.phone || lead.phone;
+  const email = detail?.email || "";
+  const tags = detail?.tags ?? [];
+  const dials = detail?.dials ?? [];
+
+  const telDigits = e164(phone);
+  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
+
+  return (
+    <aside
+      className="flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] lg:w-[380px] lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]"
+      aria-label="Lead cockpit"
+    >
+      {/* Header: identity + click-to-call, stays put while the body scrolls. */}
+      <div className="flex items-start gap-3 border-b border-divider px-4 pb-3.5 pt-4">
+        <Avatar name={name} size="sm" />
+        <div className="min-w-0 flex-1">
+          <div className="truncate font-display text-[15px] font-semibold text-text">{name}</div>
+          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
+            {hasPhone ? (
+              <a
+                href={`tel:${telDigits}`}
+                className="inline-flex items-center gap-1 font-data text-brand-text hover:underline"
+              >
+                <Phone size={11} aria-hidden />
+                {formatPhone(phone) || phone}
+              </a>
+            ) : (
+              <span className="text-faint">No phone on file</span>
+            )}
+            {email && (
+              <a
+                href={`mailto:${email}`}
+                className="inline-flex min-w-0 items-center gap-1 truncate text-brand-text hover:underline"
+              >
+                <Mail size={11} aria-hidden className="shrink-0" />
+                <span className="truncate">{email}</span>
+              </a>
+            )}
+          </div>
+          <div className="mt-1.5 truncate text-[11px] text-faint">{lead.stageName}</div>
+        </div>
+        <button
+          type="button"
+          onClick={onClose}
+          aria-label="Close lead cockpit"
+          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
+        >
+          <X size={14} />
+        </button>
+      </div>
+
+      {/* Body: everything below scrolls on its own, the board above/behind
+          it keeps whatever scroll position it was at. */}
+      <div className="min-h-0 flex-1 overflow-y-auto">
+        <Section title="Log this call">
+          <DialLogger tenantId={tenantId} pipelineId={pipelineId} pipelineName={pipelineName} lead={lead} />
+        </Section>
+
+        <Section title="Tags">
+          {detailQuery.isError ? (
+            <DetailLoadError what="tags" onRetry={() => detailQuery.refetch()} />
+          ) : (
+            <TagField tenantId={tenantId} contactId={lead.contactId} tags={tags} dials={dials} />
+          )}
+        </Section>
+
+        <Section title="Book an estimate">
+          <SlotPicker tenantId={tenantId} contactId={lead.contactId} leadName={name} />
+        </Section>
+
+        <Section title="Call history">
+          {detailQuery.isLoading ? (
+            <p className="text-[12.5px] text-muted">Loading history...</p>
+          ) : detailQuery.isError ? (
+            <DetailLoadError what="call history" onRetry={() => detailQuery.refetch()} />
+          ) : dials.length === 0 ? (
+            <p className="text-[12.5px] text-faint">No dials logged yet.</p>
+          ) : (
+            <ul className="flex flex-col gap-2.5">
+              {dials.map((d) => (
+                <li
+                  key={d.id}
+                  className={
+                    "rounded-[var(--radius)] border px-3 py-2.5 " +
+                    (isOptimisticDial(d.id)
+                      ? "border-dashed border-brand/40 bg-brand-tint/40"
+                      : "border-border bg-surface-2")
+                  }
+                >
+                  <div className="flex items-center justify-between gap-2">
+                    <span className="font-display text-[12.5px] font-semibold text-text">
+                      {formatOutcome(d.outcome)}
+                    </span>
+                    <span className="font-data shrink-0 text-[11px] text-faint">
+                      {timeAgo(d.dialedAt, now)}
+                    </span>
+                  </div>
+                  <div className="mt-1 flex items-center gap-1.5">
+                    <span
+                      className={
+                        "rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide " +
+                        (d.spoke ? "bg-positive-tint text-positive" : "bg-surface-3 text-faint")
+                      }
+                    >
+                      {d.spoke ? "Spoke" : "No answer"}
+                    </span>
+                    {isOptimisticDial(d.id) && (
+                      <span className="text-[10px] font-medium text-faint">Saving...</span>
+                    )}
+                  </div>
+                  {d.note && (
+                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] text-muted">
+                      {d.note}
+                    </p>
+                  )}
+                  {d.tagsApplied.length > 0 && (
+                    <div className="mt-1.5 flex flex-wrap gap-1">
+                      {d.tagsApplied.map((t) => (
+                        <span
+                          key={t}
+                          className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted"
+                        >
+                          {t}
+                        </span>
+                      ))}
+                    </div>
+                  )}
+                </li>
+              ))}
+            </ul>
+          )}
+        </Section>
+      </div>
+    </aside>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/SlotPicker.tsx b/command-center/app/src/components/admin/setter/SlotPicker.tsx
new file mode 100644
index 0000000..ccd158d
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SlotPicker.tsx
@@ -0,0 +1,225 @@
+import { useEffect, useState } from "react";
+import { CalendarClock, Loader2, TriangleAlert } from "lucide-react";
+import { useSetterSlotsQuery, useSetterBookMutation } from "../../../hooks/useApi";
+import { useToast } from "../../../context/ToastContext";
+import { ApiError } from "../../../lib/api";
+import { formatSlotDay, formatSlotTime, computeSlotEnd } from "../../../lib/setterCockpit";
+
+interface Props {
+  tenantId: string;
+  contactId: string;
+  leadName: string;
+}
+
+const DAYS_AHEAD = 14;
+const fieldClass =
+  "w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-brand/50";
+
+// Live slot lookup + booking, scoped to a calendar chosen by name (the
+// Setter Suite works every pipeline for a client, so there is no single
+// fixed calendar to hardcode the way the client-facing "Home Estimate"
+// visit flow does; see functions/api/admin/setter/slots.ts + book.ts, both
+// generic on calendarName). A day selector narrows the live slot grid to
+// one day at a time so the docked panel stays compact.
+//
+// Booking is terminal: functions/api/admin/setter/book.ts deliberately does
+// not retry (a retry can double-book a real customer), and this component
+// honours that by disabling the Book button the instant the mutation is
+// in flight, with no retry wired anywhere in the call chain.
+export default function SlotPicker({ tenantId, contactId, leadName }: Props) {
+  const { showToast } = useToast();
+  const [calendarName, setCalendarName] = useState("Home Estimate");
+  const [durationMinutes, setDurationMinutes] = useState(60);
+  const [selectedDate, setSelectedDate] = useState<string | null>(null);
+  const [picked, setPicked] = useState<string | null>(null);
+
+  const slotsQuery = useSetterSlotsQuery(tenantId, calendarName, DAYS_AHEAD, true);
+  const bookMutation = useSetterBookMutation();
+
+  const days = slotsQuery.data?.days ?? [];
+
+  // Keep the selected day valid as the live data changes (a fresh calendar
+  // name, or a day that has since emptied out): fall back to the first day
+  // with slots rather than showing an empty grid for a day the API no
+  // longer lists.
+  useEffect(() => {
+    if (days.length === 0) {
+      setSelectedDate(null);
+      return;
+    }
+    if (!selectedDate || !days.some((d) => d.date === selectedDate)) {
+      setSelectedDate(days[0].date);
+    }
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [days.map((d) => d.date).join(",")]);
+
+  const activeDay = days.find((d) => d.date === selectedDate) ?? null;
+
+  const err = slotsQuery.error;
+  const errorCode =
+    err instanceof ApiError && err.body && typeof err.body === "object"
+      ? (err.body as { error?: string }).error
+      : null;
+  const needsStaff = errorCode === "needs_staff";
+  const notFound = errorCode === "calendar_not_found";
+
+  const book = () => {
+    if (!picked || bookMutation.isPending) return;
+    const endTime = computeSlotEnd(picked, durationMinutes);
+    bookMutation.mutate(
+      {
+        tenantId,
+        calendarName,
+        contactId,
+        startTime: picked,
+        endTime,
+        title: `Estimate for ${leadName}`,
+      },
+      {
+        onSuccess: () => {
+          showToast(`Booked ${formatSlotDay(picked.slice(0, 10))} at ${formatSlotTime(picked)}`);
+          setPicked(null);
+        },
+        onError: (e) => {
+          const code =
+            e instanceof ApiError && e.body && typeof e.body === "object"
+              ? (e.body as { error?: string }).error
+              : null;
+          if (code === "needs_staff") {
+            showToast("This calendar has no team members assigned, so it cannot be booked.");
+          } else {
+            showToast("Could not book that time, please try again");
+          }
+        },
+      },
+    );
+  };
+
+  return (
+    <div className="flex flex-col gap-3">
+      <div className="grid grid-cols-2 gap-2">
+        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
+          Calendar
+          <input
+            value={calendarName}
+            onChange={(e) => {
+              setCalendarName(e.target.value);
+              setPicked(null);
+            }}
+            className={`${fieldClass} mt-1 normal-case`}
+          />
+        </label>
+        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
+          Duration (min)
+          <input
+            type="number"
+            min={15}
+            step={15}
+            value={durationMinutes}
+            onChange={(e) => setDurationMinutes(Math.max(15, Number(e.target.value) || 60))}
+            className={`${fieldClass} mt-1 normal-case`}
+          />
+        </label>
+      </div>
+
+      {slotsQuery.isLoading && (
+        <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted">
+          <Loader2 size={14} className="animate-spin" /> Loading available times...
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && needsStaff && (
+        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
+          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
+          <span>This calendar has no team members assigned, so it cannot return availability.</span>
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && notFound && (
+        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
+          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
+          <span>Could not find a calendar named &quot;{calendarName}&quot;. Check the name and try again.</span>
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && slotsQuery.isError && !needsStaff && !notFound && (
+        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
+          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
+          <span>Could not load available times. Try again.</span>
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && !slotsQuery.isError && days.length === 0 && (
+        <p className="py-2 text-[12.5px] text-muted">
+          No open times on this calendar in the next {DAYS_AHEAD} days.
+        </p>
+      )}
+
+      {!slotsQuery.isLoading && !slotsQuery.isError && days.length > 0 && (
+        <>
+          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
+            {days.map((d) => {
+              const on = d.date === selectedDate;
+              return (
+                <button
+                  key={d.date}
+                  type="button"
+                  onClick={() => {
+                    setSelectedDate(d.date);
+                    setPicked(null);
+                  }}
+                  className={
+                    "shrink-0 rounded-[var(--radius)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors " +
+                    (on
+                      ? "border-brand bg-brand text-white shadow-[var(--shadow-brand)]"
+                      : "border-border bg-surface text-text hover:border-brand/40")
+                  }
+                >
+                  {formatSlotDay(d.date)}
+                </button>
+              );
+            })}
+          </div>
+
+          {activeDay && (
+            <div className="flex flex-wrap gap-1.5">
+              {activeDay.slots.map((slot) => {
+                const on = picked === slot;
+                return (
+                  <button
+                    key={slot}
+                    type="button"
+                    onClick={() => setPicked(slot)}
+                    className={
+                      "rounded-[var(--radius)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors " +
+                      (on
+                        ? "border-brand bg-brand text-white shadow-[var(--shadow-brand)]"
+                        : "border-border bg-surface text-text hover:border-brand/40")
+                    }
+                  >
+                    {formatSlotTime(slot)}
+                  </button>
+                );
+              })}
+            </div>
+          )}
+
+          <button
+            type="button"
+            onClick={book}
+            disabled={!picked || bookMutation.isPending}
+            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
+            style={{ backgroundImage: "var(--grad-brand)" }}
+          >
+            {bookMutation.isPending ? (
+              <Loader2 size={14} className="animate-spin" />
+            ) : (
+              <CalendarClock size={14} />
+            )}
+            {bookMutation.isPending ? "Booking..." : picked ? "Book this time" : "Pick a time to book"}
+          </button>
+        </>
+      )}
+    </div>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/TagField.tsx b/command-center/app/src/components/admin/setter/TagField.tsx
new file mode 100644
index 0000000..0b50adb
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/TagField.tsx
@@ -0,0 +1,153 @@
+import { useState } from "react";
+import { X, Plus, TriangleAlert } from "lucide-react";
+import { useSetterTagsMutation } from "../../../hooks/useApi";
+import { useToast } from "../../../context/ToastContext";
+import type { ApiSetterDial } from "../../../lib/api";
+
+interface Props {
+  tenantId: string;
+  contactId: string;
+  tags: string[];
+  dials: ApiSetterDial[];
+}
+
+// Derives suggestions from tags this contact's own dial history has already
+// applied (setter_dials.tags_applied), minus whatever is already on the
+// contact. Real, live, contact-specific data rather than a fabricated
+// location-wide catalog the backend does not expose.
+function suggestionsFrom(dials: ApiSetterDial[], current: string[]): string[] {
+  const currentSet = new Set(current.map((t) => t.toLowerCase()));
+  const seen = new Set<string>();
+  const out: string[] = [];
+  for (const d of dials) {
+    for (const t of d.tagsApplied) {
+      const key = t.toLowerCase();
+      if (currentSet.has(key) || seen.has(key)) continue;
+      seen.add(key);
+      out.push(t);
+    }
+  }
+  return out.slice(0, 6);
+}
+
+// Current tags as removable chips, a free input to add a new one, and a
+// short row of tags previously applied on this contact's own call history.
+// Every add/remove goes straight to the live CRM contact and fires that
+// client's automations, so this never guesses at the result: the chip list
+// always reflects the mutation response, the CRM's actual tag list after
+// the write (functions/api/admin/setter/tags.ts re-reads rather than
+// echoes).
+export default function TagField({ tenantId, contactId, tags, dials }: Props) {
+  const { showToast } = useToast();
+  const tagsMutation = useSetterTagsMutation();
+  const [draft, setDraft] = useState("");
+  const [busyTag, setBusyTag] = useState<string | null>(null);
+
+  const suggestions = suggestionsFrom(dials, tags);
+
+  const addTag = (tag: string) => {
+    const value = tag.trim();
+    if (!value || tags.some((t) => t.toLowerCase() === value.toLowerCase())) return;
+    tagsMutation.mutate(
+      { tenantId, contactId, add: [value] },
+      {
+        onSuccess: () => setDraft(""),
+        onError: () => showToast("Could not add that tag, please try again"),
+      },
+    );
+  };
+
+  const removeTag = (tag: string) => {
+    setBusyTag(tag);
+    tagsMutation.mutate(
+      { tenantId, contactId, remove: [tag] },
+      {
+        onSuccess: () => setBusyTag(null),
+        onError: () => {
+          setBusyTag(null);
+          showToast("Could not remove that tag, please try again");
+        },
+      },
+    );
+  };
+
+  return (
+    <div className="flex flex-col gap-2.5">
+      <div className="flex flex-wrap gap-1.5">
+        {tags.length === 0 ? (
+          <p className="text-[12.5px] text-faint">No tags on this contact yet.</p>
+        ) : (
+          tags.map((tag) => (
+            <span
+              key={tag}
+              className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1.5 text-[11.5px] font-semibold text-muted"
+            >
+              {tag}
+              <button
+                type="button"
+                onClick={() => removeTag(tag)}
+                disabled={tagsMutation.isPending}
+                aria-label={`Remove tag ${tag}`}
+                className="grid h-4 w-4 place-items-center rounded-full text-faint transition-colors hover:bg-surface-3 hover:text-danger disabled:opacity-50"
+              >
+                {busyTag === tag && tagsMutation.isPending ? (
+                  <span className="h-2 w-2 animate-pulse rounded-full bg-faint" aria-hidden />
+                ) : (
+                  <X size={11} />
+                )}
+              </button>
+            </span>
+          ))
+        )}
+      </div>
+
+      <form
+        onSubmit={(e) => {
+          e.preventDefault();
+          addTag(draft);
+        }}
+        className="flex items-center gap-2"
+      >
+        <input
+          value={draft}
+          onChange={(e) => setDraft(e.target.value)}
+          placeholder="Add a tag"
+          className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50"
+        />
+        <button
+          type="submit"
+          disabled={!draft.trim() || tagsMutation.isPending}
+          aria-label="Add tag"
+          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] border border-border bg-surface text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
+        >
+          <Plus size={14} />
+        </button>
+      </form>
+
+      {suggestions.length > 0 && (
+        <div className="flex flex-wrap items-center gap-1.5">
+          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
+            Used before
+          </span>
+          {suggestions.map((tag) => (
+            <button
+              key={tag}
+              type="button"
+              onClick={() => addTag(tag)}
+              disabled={tagsMutation.isPending}
+              className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
+            >
+              + {tag}
+            </button>
+          ))}
+        </div>
+      )}
+
+      <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-warning">
+        <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
+        Adding or removing a tag fires this client&apos;s automations immediately, only tag
+        what you mean to trigger.
+      </p>
+    </div>
+  );
+}
diff --git a/command-center/app/src/hooks/useApi.ts b/command-center/app/src/hooks/useApi.ts
index 1b67fec..9045fb1 100644
--- a/command-center/app/src/hooks/useApi.ts
+++ b/command-center/app/src/hooks/useApi.ts
@@ -38,21 +38,33 @@ import {
   type AdminClientBillingResponse,
   type AdTrackerLevel,
   type AdTrackerRange,
   type AdTrackerResponse,
   type ApiReviewsResponse,
   type PillarConstraint,
   getSalesData,
   saveSalesDataDay,
   type SalesDataRow,
   type SalesDataPatch,
+  type ApiSetterPipeline,
+  type ApiSetterLead,
+  type ApiSetterLeadsResponse,
+  type ApiSetterLeadDetail,
+  type ApiSetterDial,
 } from "../lib/api";
+import {
+  buildOptimisticDial,
+  prependOptimisticDial,
+  bumpLeadForDial,
+  OPTIMISTIC_DIAL_PREFIX,
+  type OptimisticDialInput,
+} from "../lib/setterCockpit";
 import type { BusinessHealthInputs, PeriodType } from "../lib/businessHealth";
 import {
   type CustomersResponse,
   type CustomerDetailResponse,
   type CustomerJobInput,
   type ServicePlanInput,
 } from "../lib/customers";
 import {
   type CloseOutPrefill,
   type CloseOutRequest,
@@ -396,20 +408,247 @@ interface SendConversationSmsInput {
 export function useAdminClientsQuery(enabled: boolean) {
   return useQuery({
     queryKey: ["admin", "clients"],
     enabled,
     staleTime: 60_000,
     queryFn: () =>
       api<{ clients: AdminClient[]; total: number }>("/api/admin/clients"),
   });
 }
 
+// Setter Suite: every pipeline and stage for the selected client, resolved
+// live and unfiltered (unlike the client-facing PipelinesContext, nothing is
+// hidden here). Feeds the pipeline tab strip on /admin/setter.
+export function useSetterPipelinesQuery(tenantId: string, enabled = true) {
+  return useQuery({
+    queryKey: ["admin", "setter", "pipelines", tenantId],
+    enabled: enabled && !!tenantId,
+    staleTime: 30_000,
+    queryFn: () =>
+      api<{ pipelines: ApiSetterPipeline[] }>(
+        `/api/admin/setter/pipelines?tenantId=${encodeURIComponent(tenantId)}`,
+      ),
+  });
+}
+
+// Setter Suite: every open lead in one pipeline, merged with its dial
+// history. Re-fetched per pipeline tab rather than once for all 8, so
+// switching tabs never fires 8 requests up front.
+export function useSetterLeadsQuery(tenantId: string, pipelineId: string, enabled = true) {
+  return useQuery({
+    queryKey: ["admin", "setter", "leads", tenantId, pipelineId],
+    enabled: enabled && !!tenantId && !!pipelineId,
+    staleTime: 15_000,
+    queryFn: () =>
+      api<ApiSetterLeadsResponse>(
+        `/api/admin/setter/leads?tenantId=${encodeURIComponent(tenantId)}&pipelineId=${encodeURIComponent(pipelineId)}`,
+      ),
+  });
+}
+
+// Setter Suite cockpit: one contact's live name/phone/email/tags plus its
+// full dial history, newest first. Powers the panel docked beside the
+// board (src/components/admin/setter/SetterCockpit.tsx).
+export function useSetterLeadDetailQuery(
+  tenantId: string,
+  contactId: string | null,
+  enabled = true,
+) {
+  return useQuery({
+    queryKey: ["admin", "setter", "lead", tenantId, contactId],
+    enabled: enabled && !!tenantId && !!contactId,
+    staleTime: 10_000,
+    queryFn: () =>
+      api<{ lead: ApiSetterLeadDetail }>(
+        `/api/admin/setter/lead/${encodeURIComponent(contactId ?? "")}?tenantId=${encodeURIComponent(tenantId)}`,
+      ),
+  });
+}
+
+export interface LogSetterDialInput extends OptimisticDialInput {
+  tenantId: string;
+  // Client-side only, never sent to the API: locates the board's cached
+  // leads list (["admin","setter","leads",tenantId,pipelineId]) so the
+  // matching card can be bumped optimistically. leadId is the opportunity
+  // id, ApiSetterLead.id, used to find the right card in that list.
+  pipelineId: string;
+  leadId: string;
+}
+
+// Logs one dial (POST /api/admin/setter/dials). Optimistic on both caches it
+// feeds: the lead detail's timeline (a dial appears immediately, newest
+// first, src/lib/setterCockpit.ts:prependOptimisticDial) and the board's
+// card (attempts/contacted/lastOutcome bump the same way the server's own
+// functions/lib/setterMetrics.ts:rollUpByContact would once the real row
+// lands, via bumpLeadForDial). Rolled back to the exact previous snapshot on
+// failure, never a partial patch, so a failed write can never leave a
+// phantom dial or an inflated attempt count on screen: the attempt count is
+// the setter's real contact-rate metric.
+export function useLogSetterDial() {
+  const qc = useQueryClient();
+  return useMutation({
+    mutationFn: (input: LogSetterDialInput) =>
+      api<{ dial: ApiSetterDial }>("/api/admin/setter/dials", {
+        method: "POST",
+        body: JSON.stringify({
+          tenantId: input.tenantId,
+          contactId: input.contactId,
+          opportunityId: input.opportunityId ?? null,
+          pipelineName: input.pipelineName ?? null,
+          stageName: input.stageName ?? null,
+          spoke: input.spoke,
+          outcome: input.outcome,
+          note: input.note ?? null,
+          tagsApplied: input.tagsApplied ?? [],
+        }),
+      }),
+    onMutate: async (input) => {
+      const detailKey = ["admin", "setter", "lead", input.tenantId, input.contactId] as const;
+      const listKey = ["admin", "setter", "leads", input.tenantId, input.pipelineId] as const;
+      await Promise.all([
+        qc.cancelQueries({ queryKey: detailKey }),
+        qc.cancelQueries({ queryKey: listKey }),
+      ]);
+
+      const previousDetail = qc.getQueryData<{ lead: ApiSetterLeadDetail }>(detailKey);
+      const previousList = qc.getQueryData<ApiSetterLeadsResponse>(listKey);
+
+      const tempId = `${OPTIMISTIC_DIAL_PREFIX}${Date.now()}`;
+      const nowIso = new Date().toISOString();
+      const optimisticDial = buildOptimisticDial(input, nowIso, tempId);
+
+      if (previousDetail) {
+        qc.setQueryData(detailKey, {
+          lead: {
+            ...previousDetail.lead,
+            dials: prependOptimisticDial(previousDetail.lead.dials, optimisticDial),
+          },
+        });
+      }
+      if (previousList) {
+        qc.setQueryData(listKey, {
+          ...previousList,
+          leads: previousList.leads.map((l: ApiSetterLead) =>
+            l.id === input.leadId ? bumpLeadForDial(l, optimisticDial) : l,
+          ),
+        });
+      }
+
+      return { previousDetail, previousList, detailKey, listKey };
+    },
+    onError: (_err, _input, context) => {
+      if (context?.previousDetail) qc.setQueryData(context.detailKey, context.previousDetail);
+      if (context?.previousList) qc.setQueryData(context.listKey, context.previousList);
+    },
+    onSettled: (_data, _err, input) => {
+      qc.invalidateQueries({ queryKey: ["admin", "setter", "lead", input.tenantId, input.contactId] });
+      qc.invalidateQueries({ queryKey: ["admin", "setter", "leads", input.tenantId, input.pipelineId] });
+    },
+  });
+}
+
+export interface SetterTagsInput {
+  tenantId: string;
+  contactId: string;
+  add?: string[];
+  remove?: string[];
+}
+
+// Adds/removes tags on the live CRM contact (POST /api/admin/setter/tags),
+// then writes the RESPONSE's tag list into the lead detail cache: the API
+// re-reads the contact after writing rather than echoing the request
+// (functions/api/admin/setter/tags.ts), and this does the same on the
+// client, so the cockpit only ever shows what the CRM actually holds, never
+// an optimistic guess, since these tags fire live automations.
+export function useSetterTagsMutation() {
+  const qc = useQueryClient();
+  return useMutation({
+    mutationFn: (input: SetterTagsInput) =>
+      api<{ tags: string[] }>("/api/admin/setter/tags", {
+        method: "POST",
+        body: JSON.stringify(input),
+      }),
+    onSuccess: (data, input) => {
+      const detailKey = ["admin", "setter", "lead", input.tenantId, input.contactId];
+      const previous = qc.getQueryData<{ lead: ApiSetterLeadDetail }>(detailKey);
+      if (previous) {
+        qc.setQueryData(detailKey, { lead: { ...previous.lead, tags: data.tags } });
+      }
+    },
+  });
+}
+
+export interface SetterSlotDay {
+  date: string; // "YYYY-MM-DD"
+  slots: string[]; // ISO start times with offset
+}
+export interface SetterSlotsResponse {
+  ok: true;
+  timezone: string;
+  days: SetterSlotDay[];
+}
+
+// Live free-slot lookup for the cockpit's booking section (GET
+// /api/admin/setter/slots). Only fetched while a calendar name is entered,
+// and never retried: a 422 (calendar_not_found / needs_staff) is permanent
+// for this call, not transient, so the panel can show an honest message
+// instead of spinning.
+export function useSetterSlotsQuery(
+  tenantId: string,
+  calendarName: string,
+  days: number,
+  enabled: boolean,
+) {
+  return useQuery({
+    queryKey: ["admin", "setter", "slots", tenantId, calendarName, days],
+    enabled: enabled && !!tenantId && !!calendarName.trim(),
+    staleTime: 30_000,
+    retry: false,
+    queryFn: () =>
+      api<SetterSlotsResponse>(
+        `/api/admin/setter/slots?tenantId=${encodeURIComponent(tenantId)}&calendarName=${encodeURIComponent(calendarName)}&days=${days}`,
+      ),
+  });
+}
+
+export interface SetterBookInput {
+  tenantId: string;
+  calendarName: string;
+  contactId: string;
+  startTime: string;
+  endTime: string;
+  title?: string;
+}
+
+// Books a real appointment (POST /api/admin/setter/book). Deliberately
+// never retried: a retried POST here can double-book a real customer into a
+// real calendar (see functions/api/admin/setter/book.ts's header comment).
+// The default mutation retry is already 0 (src/lib/queryClient.ts), but this
+// stays explicit since it is a hard requirement, not an incidental default.
+// The caller (SlotPicker) must also disable its Book button while
+// isPending, so a double-click cannot fire the mutate function twice.
+export function useSetterBookMutation() {
+  const qc = useQueryClient();
+  return useMutation({
+    retry: false,
+    mutationFn: (input: SetterBookInput) =>
+      api<{ ok: boolean; id?: string }>("/api/admin/setter/book", {
+        method: "POST",
+        body: JSON.stringify(input),
+      }),
+    onSuccess: (_data, input) => {
+      qc.invalidateQueries({ queryKey: ["admin", "setter", "leads", input.tenantId] });
+      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
+    },
+  });
+}
+
 // One client's full admin detail (business info, entitlements, staff,
 // GHL-identified members, recent activity) for the Service Delivery cockpit.
 // Keyed by tenantId so the header and the Overview tab (Task 3.3) mounting
 // side by side share one cached request instead of fetching twice.
 export function useAdminClientDetailQuery(tenantId: string, enabled = true) {
   return useQuery({
     queryKey: ["admin", "clients", tenantId],
     enabled: enabled && !!tenantId,
     staleTime: 30_000,
     queryFn: () => api<AdminClientDetailResponse>(`/api/admin/clients/${tenantId}`),
diff --git a/command-center/app/src/lib/api.ts b/command-center/app/src/lib/api.ts
index c377fa1..99e57af 100644
--- a/command-center/app/src/lib/api.ts
+++ b/command-center/app/src/lib/api.ts
@@ -857,10 +857,86 @@ export interface ColdSmsMonthlyRow {
 
 export interface ColdSmsScriptRow {
   id: string;
   name: string;
   totalSent: number | null;
   positiveReplies: number | null;
   callsBooked: number | null;
   clientsClosed: number | null;
   sortOrder: number;
 }
+
+// Setter Suite (Sales / admin-only). Mirrors the shapes returned by
+// functions/api/admin/setter/pipelines.ts and functions/api/admin/setter/leads.ts
+// exactly; see those files for the shaping logic.
+export interface ApiSetterStage {
+  id: string;
+  name: string;
+  // Live GHL hex, e.g. "#F97316". Rendered as an 8px dot only, per Board.tsx's
+  // convention: never a background, border, or text color.
+  color?: string;
+  // True when the live stage name matches /needs dialing/i. No mapping table.
+  needsDialing: boolean;
+}
+
+export interface ApiSetterPipeline {
+  id: string;
+  name: string;
+  stages: ApiSetterStage[];
+}
+
+// Deliberately has no `tags` field: the list endpoint cannot supply it
+// without an N+1 contact fetch per card across the whole board (see
+// functions/api/admin/setter/leads.ts). Tags belong to the per-lead detail
+// endpoint (a later task), which fetches one contact at a time.
+export interface ApiSetterLead {
+  id: string;
+  contactId: string;
+  name: string;
+  phone: string;
+  city: string;
+  stageName: string;
+  createdAt: string;
+  attempts: number;
+  firstDialedAt: string | null;
+  contacted: boolean;
+  lastOutcome: string | null;
+}
+
+export interface ApiSetterLeadsResponse {
+  leads: ApiSetterLead[];
+  // The leads endpoint caps at 1000 opportunities per pipeline
+  // (functions/lib/ghl.ts fetchAllOpportunities, maxPages: 10 at 100/page).
+  // The board must show this honestly rather than silently drop leads.
+  truncated: boolean;
+}
+
+// One row of setter_dials, camelCased exactly as
+// functions/api/admin/setter/dials.ts:shapeDialRow returns it. Shared by the
+// lead detail endpoint (dials, newest first) and the dial-logging response.
+export interface ApiSetterDial {
+  id: string;
+  contactId: string;
+  opportunityId: string | null;
+  pipelineName: string | null;
+  stageName: string | null;
+  dialedAt: string;
+  spoke: boolean;
+  outcome: string;
+  note: string | null;
+  tagsApplied: string[];
+  createdBy: string | null;
+  createdAt: string;
+}
+
+// The cockpit's single-lead panel. Mirrors
+// functions/api/admin/setter/lead/[contactId].ts's ApiSetterLeadDetail
+// exactly: unlike ApiSetterLead (the board card), this DOES carry tags,
+// fetched from one contact so it costs nothing extra.
+export interface ApiSetterLeadDetail {
+  contactId: string;
+  name: string;
+  phone: string;
+  email: string;
+  tags: string[];
+  dials: ApiSetterDial[];
+}
diff --git a/command-center/app/src/lib/setterCockpit.test.ts b/command-center/app/src/lib/setterCockpit.test.ts
new file mode 100644
index 0000000..f23352c
--- /dev/null
+++ b/command-center/app/src/lib/setterCockpit.test.ts
@@ -0,0 +1,239 @@
+import { describe, it, expect } from "vitest";
+import {
+  OUTCOMES,
+  defaultSpokeForOutcome,
+  isContradictoryDial,
+  buildOptimisticDial,
+  isOptimisticDial,
+  prependOptimisticDial,
+  bumpLeadForDial,
+  formatSlotTime,
+  formatSlotDay,
+  computeSlotEnd,
+} from "./setterCockpit";
+import type { ApiSetterDial, ApiSetterLead } from "./api";
+
+describe("OUTCOMES", () => {
+  it("is exactly Jake's five outcomes, in order, mapped to the API's enum", () => {
+    expect(OUTCOMES.map((o) => o.value)).toEqual([
+      "booked",
+      "not_interested",
+      "no_answer",
+      "reschedule",
+      "bad_lead",
+    ]);
+    expect(OUTCOMES.map((o) => o.label)).toEqual([
+      "Booked",
+      "Not interested",
+      "No answer",
+      "Reschedule",
+      "Bad lead",
+    ]);
+  });
+});
+
+describe("defaultSpokeForOutcome", () => {
+  it("defaults to false for no_answer, since nobody picked up", () => {
+    expect(defaultSpokeForOutcome("no_answer")).toBe(false);
+  });
+  it("defaults to true for every other outcome", () => {
+    expect(defaultSpokeForOutcome("booked")).toBe(true);
+    expect(defaultSpokeForOutcome("not_interested")).toBe(true);
+    expect(defaultSpokeForOutcome("reschedule")).toBe(true);
+    expect(defaultSpokeForOutcome("bad_lead")).toBe(true);
+  });
+});
+
+describe("isContradictoryDial", () => {
+  it("mirrors the server's check: no_answer can never be paired with spoke true", () => {
+    expect(isContradictoryDial("no_answer", true)).toBe(true);
+  });
+  it("is not contradictory when no_answer pairs with spoke false", () => {
+    expect(isContradictoryDial("no_answer", false)).toBe(false);
+  });
+  it("is never contradictory for any other outcome, spoke true or false", () => {
+    expect(isContradictoryDial("booked", true)).toBe(false);
+    expect(isContradictoryDial("booked", false)).toBe(false);
+    expect(isContradictoryDial("reschedule", true)).toBe(false);
+  });
+});
+
+describe("buildOptimisticDial / isOptimisticDial", () => {
+  it("builds a dial row shaped exactly like the server's, tagged with a temp id", () => {
+    const dial = buildOptimisticDial(
+      {
+        contactId: "c1",
+        opportunityId: "o1",
+        pipelineName: "Sales Pipeline",
+        stageName: "Hot Lead",
+        spoke: true,
+        outcome: "booked",
+        note: "Wants a morning slot",
+        tagsApplied: ["hot"],
+      },
+      "2026-07-20T12:00:00.000Z",
+      "optimistic-1",
+    );
+    expect(dial).toEqual({
+      id: "optimistic-1",
+      contactId: "c1",
+      opportunityId: "o1",
+      pipelineName: "Sales Pipeline",
+      stageName: "Hot Lead",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+      spoke: true,
+      outcome: "booked",
+      note: "Wants a morning slot",
+      tagsApplied: ["hot"],
+      createdBy: null,
+      createdAt: "2026-07-20T12:00:00.000Z",
+    });
+  });
+
+  it("defaults optional fields to null/empty, matching the server shape", () => {
+    const dial = buildOptimisticDial(
+      { contactId: "c1", spoke: false, outcome: "no_answer" },
+      "2026-07-20T12:00:00.000Z",
+      "optimistic-2",
+    );
+    expect(dial.opportunityId).toBeNull();
+    expect(dial.pipelineName).toBeNull();
+    expect(dial.stageName).toBeNull();
+    expect(dial.note).toBeNull();
+    expect(dial.tagsApplied).toEqual([]);
+  });
+
+  it("isOptimisticDial recognizes a temp id and rejects a real server id", () => {
+    expect(isOptimisticDial("optimistic-1")).toBe(true);
+    expect(isOptimisticDial("9c6f7c1e-real-uuid")).toBe(false);
+  });
+});
+
+describe("prependOptimisticDial", () => {
+  it("puts the new dial first, newest-first order matching the server", () => {
+    const existing: ApiSetterDial[] = [
+      {
+        id: "d1",
+        contactId: "c1",
+        opportunityId: null,
+        pipelineName: null,
+        stageName: null,
+        dialedAt: "2026-07-19T12:00:00.000Z",
+        spoke: false,
+        outcome: "no_answer",
+        note: null,
+        tagsApplied: [],
+        createdBy: "admin1",
+        createdAt: "2026-07-19T12:00:00.000Z",
+      },
+    ];
+    const fresh: ApiSetterDial = {
+      id: "optimistic-1",
+      contactId: "c1",
+      opportunityId: null,
+      pipelineName: null,
+      stageName: null,
+      dialedAt: "2026-07-20T12:00:00.000Z",
+      spoke: true,
+      outcome: "booked",
+      note: null,
+      tagsApplied: [],
+      createdBy: null,
+      createdAt: "2026-07-20T12:00:00.000Z",
+    };
+    expect(prependOptimisticDial(existing, fresh)).toEqual([fresh, existing[0]]);
+  });
+});
+
+describe("bumpLeadForDial", () => {
+  const baseLead: ApiSetterLead = {
+    id: "opp1",
+    contactId: "c1",
+    name: "Jane Doe",
+    phone: "5551234567",
+    city: "Garden City",
+    stageName: "Needs Dialing",
+    createdAt: "2026-07-18T00:00:00.000Z",
+    attempts: 0,
+    firstDialedAt: null,
+    contacted: false,
+    lastOutcome: null,
+  };
+
+  it("increments attempts and sets lastOutcome to the new dial's outcome", () => {
+    const next = bumpLeadForDial(baseLead, {
+      spoke: false,
+      outcome: "no_answer",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.attempts).toBe(1);
+    expect(next.lastOutcome).toBe("no_answer");
+  });
+
+  it("sets contacted true when the dial was a spoke-with, and sets firstDialedAt when it was null", () => {
+    const next = bumpLeadForDial(baseLead, {
+      spoke: true,
+      outcome: "booked",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.contacted).toBe(true);
+    expect(next.firstDialedAt).toBe("2026-07-20T12:00:00.000Z");
+  });
+
+  it("never turns contacted back off, even when the new dial itself did not spoke", () => {
+    const contactedLead = { ...baseLead, contacted: true, attempts: 2 };
+    const next = bumpLeadForDial(contactedLead, {
+      spoke: false,
+      outcome: "no_answer",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.contacted).toBe(true);
+  });
+
+  it("leaves an existing firstDialedAt untouched", () => {
+    const dialed = { ...baseLead, firstDialedAt: "2026-01-01T00:00:00.000Z", attempts: 1 };
+    const next = bumpLeadForDial(dialed, {
+      spoke: true,
+      outcome: "booked",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.firstDialedAt).toBe("2026-01-01T00:00:00.000Z");
+  });
+
+  it("does not mutate the original lead object", () => {
+    const next = bumpLeadForDial(baseLead, {
+      spoke: true,
+      outcome: "booked",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(baseLead.attempts).toBe(0);
+    expect(next).not.toBe(baseLead);
+  });
+});
+
+describe("formatSlotTime", () => {
+  it("renders the wall-clock time encoded in the slot's own offset", () => {
+    expect(formatSlotTime("2026-07-08T12:00:00-04:00")).toBe("12:00 PM");
+    expect(formatSlotTime("2026-07-08T09:30:00-04:00")).toBe("9:30 AM");
+    expect(formatSlotTime("2026-07-08T00:15:00-04:00")).toBe("12:15 AM");
+  });
+});
+
+describe("formatSlotDay", () => {
+  it("renders a short weekday + month + day label, independent of viewer timezone", () => {
+    expect(formatSlotDay("2026-07-08")).toBe("Wed, Jul 8");
+  });
+});
+
+describe("computeSlotEnd", () => {
+  it("adds the duration in minutes to the start instant", () => {
+    expect(computeSlotEnd("2026-07-08T12:00:00.000Z", 60)).toBe(
+      "2026-07-08T13:00:00.000Z",
+    );
+  });
+  it("handles non-hour durations", () => {
+    expect(computeSlotEnd("2026-07-08T12:00:00.000Z", 30)).toBe(
+      "2026-07-08T12:30:00.000Z",
+    );
+  });
+});
diff --git a/command-center/app/src/lib/setterCockpit.ts b/command-center/app/src/lib/setterCockpit.ts
new file mode 100644
index 0000000..21ccaf0
--- /dev/null
+++ b/command-center/app/src/lib/setterCockpit.ts
@@ -0,0 +1,147 @@
+// Pure model + reducer helpers for the Setter Suite cockpit
+// (src/components/admin/setter/SetterCockpit.tsx, DialLogger.tsx,
+// SlotPicker.tsx). No I/O, no React: everything here is a plain function of
+// the API's own shapes, so the outcome-to-spoke default, the optimistic dial
+// reducer, and the slot/day formatting stay unit-testable without a server,
+// a browser, or React Query.
+
+import type { ApiSetterDial, ApiSetterLead } from "./api";
+
+// Jake's five outcomes, exact wording and order, mapped to the API's own
+// enum (functions/api/admin/setter/dials.ts OUTCOMES). Never reworded, never
+// a sixth added: the DB has a check constraint on these exact values.
+export const OUTCOMES = [
+  { value: "booked", label: "Booked" },
+  { value: "not_interested", label: "Not interested" },
+  { value: "no_answer", label: "No answer" },
+  { value: "reschedule", label: "Reschedule" },
+  { value: "bad_lead", label: "Bad lead" },
+] as const;
+
+export type SetterOutcome = (typeof OUTCOMES)[number]["value"];
+
+// The API rejects outcome "no_answer" paired with spoke: true (see
+// functions/api/admin/setter/dials.ts:validateDialBody, code
+// "contradictory"): nobody picked up, so nobody was spoken to. Every other
+// outcome defaults to spoke: true, someone was reached. The setter can still
+// flip the visible override before submitting.
+export function defaultSpokeForOutcome(outcome: string): boolean {
+  return outcome !== "no_answer";
+}
+
+// Mirrors the server's own contradiction check, so the client can block a
+// bad submit before it ever reaches the network and can recognize the
+// server's "contradictory" error code if one slips through anyway (a stale
+// tab, a race with another setter).
+export function isContradictoryDial(outcome: string, spoke: boolean): boolean {
+  return outcome === "no_answer" && spoke === true;
+}
+
+// Every optimistic dial's id carries this prefix so it is unambiguous which
+// rows in a cached dial list are provisional. A real setter_dials row is a
+// Postgres uuid and can never collide with it.
+export const OPTIMISTIC_DIAL_PREFIX = "optimistic-";
+
+export function isOptimisticDial(id: string): boolean {
+  return id.startsWith(OPTIMISTIC_DIAL_PREFIX);
+}
+
+export interface OptimisticDialInput {
+  contactId: string;
+  opportunityId?: string | null;
+  pipelineName?: string | null;
+  stageName?: string | null;
+  spoke: boolean;
+  outcome: string;
+  note?: string | null;
+  tagsApplied?: string[];
+}
+
+// Shapes a freshly logged dial exactly like the server's ApiSetterDial
+// (functions/api/admin/setter/dials.ts:shapeDialRow), before the real row
+// exists, so it renders in the timeline with no special-casing.
+export function buildOptimisticDial(
+  input: OptimisticDialInput,
+  nowIso: string,
+  tempId: string,
+): ApiSetterDial {
+  return {
+    id: tempId,
+    contactId: input.contactId,
+    opportunityId: input.opportunityId ?? null,
+    pipelineName: input.pipelineName ?? null,
+    stageName: input.stageName ?? null,
+    dialedAt: nowIso,
+    spoke: input.spoke,
+    outcome: input.outcome,
+    note: input.note ?? null,
+    tagsApplied: input.tagsApplied ?? [],
+    createdBy: null,
+    createdAt: nowIso,
+  };
+}
+
+// The lead detail's dial-history reducer: newest first, matching the
+// server's own `.order("dialed_at", { ascending: false })`, so a fresh dial
+// lands exactly where the next real fetch would put it.
+export function prependOptimisticDial(
+  dials: ApiSetterDial[],
+  dial: ApiSetterDial,
+): ApiSetterDial[] {
+  return [dial, ...dials];
+}
+
+// The board card's own reducer for one new dial. Mirrors
+// functions/lib/setterMetrics.ts:rollUpByContact applied to a single append,
+// so the optimistic bump agrees with what the server will compute on the
+// next real fetch: attempts always increments; contacted only ever turns on
+// (never off, a past spoke-with stays true); lastOutcome always becomes the
+// new dial's outcome, since by construction it is the newest; firstDialedAt
+// is set only the first time.
+export function bumpLeadForDial(
+  lead: ApiSetterLead,
+  dial: { spoke: boolean; outcome: string; dialedAt: string },
+): ApiSetterLead {
+  return {
+    ...lead,
+    attempts: lead.attempts + 1,
+    contacted: lead.contacted || dial.spoke,
+    lastOutcome: dial.outcome,
+    firstDialedAt: lead.firstDialedAt ?? dial.dialedAt,
+  };
+}
+
+// Display the wall-clock time encoded in the slot's own offset (e.g. the
+// "12:00" in "2026-07-08T12:00:00-04:00"), so the label matches the
+// business's local calendar regardless of the viewer's timezone. Mirrors
+// src/components/SlotPickerModal.tsx's slotLabel; kept separate rather than
+// imported so this admin surface never touches that client-facing modal.
+export function formatSlotTime(iso: string): string {
+  const hm = iso.slice(11, 16);
+  const [hRaw, m] = hm.split(":");
+  let h = Number(hRaw);
+  const ap = h >= 12 ? "PM" : "AM";
+  h = h % 12;
+  if (h === 0) h = 12;
+  return `${h}:${m} ${ap}`;
+}
+
+// "YYYY-MM-DD" -> "Wed, Jul 8", parsed as UTC so the calendar date never
+// shifts a day under the viewer's own timezone offset.
+export function formatSlotDay(date: string): string {
+  const [y, mo, d] = date.split("-").map(Number);
+  const dt = new Date(Date.UTC(y, mo - 1, d));
+  return dt.toLocaleDateString("en-US", {
+    weekday: "short",
+    month: "short",
+    day: "numeric",
+    timeZone: "UTC",
+  });
+}
+
+// End time = start instant + duration, as an ISO string. GHL parses any
+// valid ISO 8601 instant, so a UTC end paired with an offset start is
+// accepted (mirrors SlotPickerModal's endFrom).
+export function computeSlotEnd(startIso: string, minutes: number): string {
+  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
+}
diff --git a/command-center/app/src/lib/setterModel.test.ts b/command-center/app/src/lib/setterModel.test.ts
new file mode 100644
index 0000000..62cdf90
--- /dev/null
+++ b/command-center/app/src/lib/setterModel.test.ts
@@ -0,0 +1,117 @@
+import { describe, it, expect } from "vitest";
+import { isStaleUncontacted, cardRail, formatOutcome, staleWaitingLabel } from "./setterModel";
+
+const DAY = 24 * 60 * 60 * 1000;
+const NOW = new Date("2026-07-20T12:00:00Z").getTime();
+
+describe("isStaleUncontacted", () => {
+  it("is false when the stage does not need dialing", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 2, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        false,
+        NOW,
+      ),
+    ).toBe(false);
+  });
+
+  it("is false once the lead has been contacted, no matter how old", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 2, contacted: true, createdAt: new Date(NOW - 5 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe(false);
+  });
+
+  it("is false under 24 hours old", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 1, contacted: false, createdAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe(false);
+  });
+
+  it("is true past 24 hours, uncontacted, in a needs-dialing stage", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 3, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe(true);
+  });
+});
+
+describe("cardRail", () => {
+  it("is danger for a lead with zero attempts, regardless of stage or age", () => {
+    expect(
+      cardRail({ attempts: 0, contacted: false, createdAt: new Date(NOW).toISOString() }, false, NOW),
+    ).toBe("danger");
+  });
+
+  it("danger outranks warning when both conditions hold", () => {
+    expect(
+      cardRail(
+        { attempts: 0, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe("danger");
+  });
+
+  it("is warning for a dialed-but-stale lead in a needs-dialing stage", () => {
+    expect(
+      cardRail(
+        { attempts: 2, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe("warning");
+  });
+
+  it("is null for a dialed, contacted, or fresh lead", () => {
+    expect(
+      cardRail(
+        { attempts: 2, contacted: true, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBeNull();
+    expect(
+      cardRail(
+        { attempts: 1, contacted: false, createdAt: new Date(NOW).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBeNull();
+  });
+});
+
+describe("staleWaitingLabel", () => {
+  it("renders whole hours under a day", () => {
+    expect(staleWaitingLabel(new Date(NOW - 20 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
+      "Waiting 20h",
+    );
+  });
+
+  it("renders whole days at a day or more", () => {
+    expect(staleWaitingLabel(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe("Waiting 3d");
+  });
+
+  it("falls back to a bare label on an unparseable date", () => {
+    expect(staleWaitingLabel("not-a-date", NOW)).toBe("Waiting");
+  });
+});
+
+describe("formatOutcome", () => {
+  it("title-cases the underscore-separated enum", () => {
+    expect(formatOutcome("no_answer")).toBe("No Answer");
+    expect(formatOutcome("not_interested")).toBe("Not Interested");
+    expect(formatOutcome("booked")).toBe("Booked");
+    expect(formatOutcome("bad_lead")).toBe("Bad Lead");
+  });
+});
diff --git a/command-center/app/src/lib/setterModel.ts b/command-center/app/src/lib/setterModel.ts
new file mode 100644
index 0000000..a572485
--- /dev/null
+++ b/command-center/app/src/lib/setterModel.ts
@@ -0,0 +1,69 @@
+// Pure model helpers for the Setter Suite board (src/routes/admin/SetterSuite.tsx
+// + src/components/admin/setter/*). No I/O, no React: everything here is a
+// plain function of the API response so it stays unit-testable without a
+// server or a browser.
+
+// Whether a stage needs a setter to work it is computed server-side, once,
+// in functions/api/admin/setter/pipelines.ts (shapeSetterPipeline) against
+// the live stage name, and comes down on the wire as stage.needsDialing. It
+// is deliberately not recomputed here: a second regex against the same
+// stage name would just be a copy that can drift from the server's.
+
+const DAY_MS = 24 * 60 * 60 * 1000;
+
+export interface SetterRailLead {
+  attempts: number;
+  contacted: boolean;
+  createdAt: string;
+}
+
+// True once a lead has sat in a needs-dialing stage for over 24 hours without
+// ever being spoken to. Independent of attempts: a lead dialed four times and
+// still never answered is "stale" here too, the never-dialed case below is
+// the separate, more urgent one.
+export function isStaleUncontacted(
+  lead: SetterRailLead,
+  stageNeedsDialing: boolean,
+  now: number,
+): boolean {
+  if (!stageNeedsDialing || lead.contacted) return false;
+  const createdAt = new Date(lead.createdAt).getTime();
+  if (Number.isNaN(createdAt)) return false;
+  return now - createdAt > DAY_MS;
+}
+
+export type CardRail = "danger" | "warning" | null;
+
+// The card's inset rail tone. Never-dialed (danger) always wins over stale
+// (warning) when both hold, since it is the more urgent state for a setter
+// to notice first.
+export function cardRail(lead: SetterRailLead, stageNeedsDialing: boolean, now: number): CardRail {
+  if (lead.attempts === 0) return "danger";
+  if (isStaleUncontacted(lead, stageNeedsDialing, now)) return "warning";
+  return null;
+}
+
+// Text label for how long a stale (warning-rail) lead has been waiting,
+// e.g. "Waiting 26h" or "Waiting 3d". Same hour/day bucketing as timeAgo
+// (src/lib/timeAgo.ts) but phrased as a fact for the card's chip vocabulary
+// rather than a relative timestamp caption, since the rail's color alone
+// isn't a reliable signal (color-blind setters, an easy-to-miss inset rail).
+export function staleWaitingLabel(createdAt: string, now: number): string {
+  const then = new Date(createdAt).getTime();
+  if (Number.isNaN(then)) return "Waiting";
+  const hr = Math.floor(Math.max(0, now - then) / (60 * 60 * 1000));
+  if (hr < 24) return `Waiting ${hr}h`;
+  return `Waiting ${Math.floor(hr / 24)}d`;
+}
+
+// Dial outcomes come back from the API as the setter_dials enum (booked,
+// not_interested, no_answer, reschedule, bad_lead). This is display
+// formatting of an internal enum, not a stage name, so title-casing it is
+// fine (unlike stage names, which must render verbatim).
+export function formatOutcome(outcome: string): string {
+  return outcome
+    .split("_")
+    .filter(Boolean)
+    .map((w) => w[0].toUpperCase() + w.slice(1))
+    .join(" ");
+}
diff --git a/command-center/app/src/lib/setterRates.test.ts b/command-center/app/src/lib/setterRates.test.ts
new file mode 100644
index 0000000..7de4e1d
--- /dev/null
+++ b/command-center/app/src/lib/setterRates.test.ts
@@ -0,0 +1,92 @@
+import { describe, expect, it } from "vitest";
+import { computeSetterRateStrip } from "./setterRates";
+
+type Lead = { contacted: boolean; lastOutcome: string | null };
+
+const lead = (contacted: boolean, lastOutcome: string | null): Lead => ({ contacted, lastOutcome });
+
+function tile(tiles: ReturnType<typeof computeSetterRateStrip>, key: string) {
+  const found = tiles.find((t) => t.key === key);
+  if (!found) throw new Error(`no tile ${key}`);
+  return found;
+}
+
+describe("computeSetterRateStrip", () => {
+  it("orders and words the five tiles exactly per the client's spec", () => {
+    const tiles = computeSetterRateStrip([]);
+    expect(tiles.map((t) => t.key)).toEqual([
+      "totalLeads",
+      "contactRate",
+      "bookingRate",
+      "showRate",
+      "closeRate",
+    ]);
+    expect(tile(tiles, "totalLeads")).toMatchObject({ label: "Total leads in", formula: "count of leads" });
+    expect(tile(tiles, "contactRate")).toMatchObject({ label: "Contact rate", formula: "contacted / leads" });
+    expect(tile(tiles, "bookingRate")).toMatchObject({ label: "Booking rate", formula: "booked / leads" });
+    expect(tile(tiles, "showRate")).toMatchObject({ label: "Show rate", formula: "showed / booked" });
+    expect(tile(tiles, "closeRate")).toMatchObject({ label: "Close rate", formula: "won / showed" });
+  });
+
+  it("show rate and close rate are always pending, never a number, never zero", () => {
+    // Non-empty, fully-contacted, fully-booked input: if show/close were
+    // ever derived by accident, this is the input that would produce a
+    // fake non-zero number instead of a fake zero, so it exercises both
+    // failure modes.
+    const leads = [lead(true, "booked"), lead(true, "booked")];
+    const tiles = computeSetterRateStrip(leads);
+    const show = tile(tiles, "showRate");
+    const close = tile(tiles, "closeRate");
+    expect(show.pending).toBe(true);
+    expect(show.value).toBe("");
+    expect(show.pendingReason).toBe("Needs close-out flow");
+    expect(close.pending).toBe(true);
+    expect(close.value).toBe("");
+    expect(close.pendingReason).toBe("Needs close-out flow");
+  });
+
+  it("total leads in is a real count, including zero", () => {
+    expect(tile(computeSetterRateStrip([]), "totalLeads")).toMatchObject({ pending: false, value: "0" });
+    const leads = [lead(false, null), lead(true, "booked"), lead(false, "no_answer")];
+    expect(tile(computeSetterRateStrip(leads), "totalLeads")).toMatchObject({ pending: false, value: "3" });
+  });
+
+  it("computes contact rate from the contacted flag as a rounded percent", () => {
+    const leads = [lead(true, null), lead(true, null), lead(false, null), lead(false, null)];
+    const contact = tile(computeSetterRateStrip(leads), "contactRate");
+    expect(contact.pending).toBe(false);
+    expect(contact.value).toBe("50%");
+  });
+
+  it("computes booking rate from lastOutcome === 'booked', not from contacted", () => {
+    const leads = [
+      lead(true, "booked"),
+      lead(true, "no_answer"), // contacted but never booked
+      lead(false, null),
+    ];
+    const booking = tile(computeSetterRateStrip(leads), "bookingRate");
+    expect(booking.pending).toBe(false);
+    expect(booking.value).toBe("33%");
+  });
+
+  it("does not let a zero-lead denominator render NaN, Infinity, or a fake zero", () => {
+    const tiles = computeSetterRateStrip([]);
+    const contact = tile(tiles, "contactRate");
+    const booking = tile(tiles, "bookingRate");
+    expect(contact.value).not.toBe("NaN%");
+    expect(contact.value).not.toBe("Infinity%");
+    expect(contact.pending).toBe(true);
+    expect(contact.value).toBe("");
+    expect(contact.pendingReason).toBe("No leads yet");
+    expect(booking.pending).toBe(true);
+    expect(booking.value).toBe("");
+    expect(booking.pendingReason).toBe("No leads yet");
+  });
+
+  it("a real zero (leads exist, none contacted or booked yet) is a genuine 0%, not pending", () => {
+    const leads = [lead(false, null), lead(false, "no_answer")];
+    const tiles = computeSetterRateStrip(leads);
+    expect(tile(tiles, "contactRate")).toMatchObject({ pending: false, value: "0%" });
+    expect(tile(tiles, "bookingRate")).toMatchObject({ pending: false, value: "0%" });
+  });
+});
diff --git a/command-center/app/src/lib/setterRates.ts b/command-center/app/src/lib/setterRates.ts
new file mode 100644
index 0000000..11d5ffb
--- /dev/null
+++ b/command-center/app/src/lib/setterRates.ts
@@ -0,0 +1,99 @@
+// Pure math for the Setter Suite's headline rate strip (Task 9). Built from
+// the exact leads array the board already has on screen (one pipeline's
+// worth of functions/api/admin/setter/leads.ts's ApiSetterLead): no new
+// fetch, no new endpoint, nothing sampled.
+//
+// The client specified five rates, word for word, in this order:
+//   Total leads in, Contact rate, Booking rate, Show rate, Close rate.
+// Only the first three have data behind them. Show rate (showed / booked)
+// and Close rate (won / showed) need the Estimate and Job close-out flows,
+// which do not exist yet, so they are ALWAYS pending here, independent of
+// the input: mirrors functions/lib/setterMetrics.ts's Rates type, which
+// types showRate/closeRate as the literal `null` so fabricating them is a
+// type error there too.
+
+export interface SetterRateTile {
+  key: "totalLeads" | "contactRate" | "bookingRate" | "showRate" | "closeRate";
+  label: string;
+  formula: string;
+  // true when there is no honest number to show: either the data source
+  // doesn't exist yet (show/close), or the denominator is zero (no leads
+  // loaded yet, so "contacted / leads" is 0/0, not 0).
+  pending: boolean;
+  // Formatted display value, e.g. "42%" or "7". Empty when pending: a
+  // pending tile never renders a number, not even "0%".
+  value: string;
+  pendingReason: string | null;
+}
+
+interface RateLead {
+  contacted: boolean;
+  lastOutcome: string | null;
+}
+
+// A 0-denominator fraction is undefined, not zero: returning null here (never
+// NaN, never Infinity, never a fabricated 0) is what lets the caller render
+// "No leads yet" instead of a lying "0%".
+function safeRate(numerator: number, denominator: number): number | null {
+  if (denominator === 0) return null;
+  return numerator / denominator;
+}
+
+function formatPercent(rate: number): string {
+  return `${Math.round(rate * 100)}%`;
+}
+
+export function computeSetterRateStrip(leads: RateLead[]): SetterRateTile[] {
+  const total = leads.length;
+  const contacted = leads.filter((l) => l.contacted).length;
+  // "booked" is the same dial outcome a setter logs the moment they lock in
+  // a time (functions/api/admin/setter/dials.ts's OUTCOMES), already carried
+  // on every board card as lastOutcome. No appointments fetch required.
+  const booked = leads.filter((l) => l.lastOutcome === "booked").length;
+
+  const contactRate = safeRate(contacted, total);
+  const bookingRate = safeRate(booked, total);
+
+  return [
+    {
+      key: "totalLeads",
+      label: "Total leads in",
+      formula: "count of leads",
+      pending: false,
+      value: String(total),
+      pendingReason: null,
+    },
+    {
+      key: "contactRate",
+      label: "Contact rate",
+      formula: "contacted / leads",
+      pending: contactRate === null,
+      value: contactRate === null ? "" : formatPercent(contactRate),
+      pendingReason: contactRate === null ? "No leads yet" : null,
+    },
+    {
+      key: "bookingRate",
+      label: "Booking rate",
+      formula: "booked / leads",
+      pending: bookingRate === null,
+      value: bookingRate === null ? "" : formatPercent(bookingRate),
+      pendingReason: bookingRate === null ? "No leads yet" : null,
+    },
+    {
+      key: "showRate",
+      label: "Show rate",
+      formula: "showed / booked",
+      pending: true,
+      value: "",
+      pendingReason: "Needs close-out flow",
+    },
+    {
+      key: "closeRate",
+      label: "Close rate",
+      formula: "won / showed",
+      pending: true,
+      value: "",
+      pendingReason: "Needs close-out flow",
+    },
+  ];
+}
diff --git a/command-center/app/src/routes/admin/AdminLayout.tsx b/command-center/app/src/routes/admin/AdminLayout.tsx
index efcfc52..3183494 100644
--- a/command-center/app/src/routes/admin/AdminLayout.tsx
+++ b/command-center/app/src/routes/admin/AdminLayout.tsx
@@ -31,21 +31,24 @@ interface SpineItem {
   label: string;
   icon: LucideIcon;
   // Command matches only its exact path; every other item matches its subtree
   // (e.g. Service Delivery is active for any /admin/delivery/:tenantId).
   end?: boolean;
 }
 
 const SPINE_NAV: SpineItem[] = [
   { to: "/admin", label: "Command", icon: LayoutDashboard, end: true },
   { to: "/admin/pillar/acquisition", label: "Acquisition", icon: Megaphone },
-  { to: "/admin/pillar/sales", label: "Sales", icon: Handshake },
+  // Sales points at the Setter Suite (the cross-pipeline lead-working board),
+  // not the old Sales Data pillar tab. That tab still exists at
+  // /admin/pillar/sales for anyone who links to it directly.
+  { to: "/admin/setter", label: "Sales", icon: Handshake },
   { to: "/admin/delivery", label: "Fulfillment", icon: HeartHandshake },
   { to: "/admin/pillar/operations", label: "Operations", icon: Wrench },
 ];
 
 function SpineLink({ item }: { item: SpineItem }) {
   return (
     <NavLink
       to={item.to}
       end={item.end}
       className={({ isActive }) => `adm-spine-btn${isActive ? " on" : ""}`}
diff --git a/command-center/app/src/routes/admin/SetterSuite.tsx b/command-center/app/src/routes/admin/SetterSuite.tsx
new file mode 100644
index 0000000..cd7972f
--- /dev/null
+++ b/command-center/app/src/routes/admin/SetterSuite.tsx
@@ -0,0 +1,150 @@
+import { useState } from "react";
+import {
+  useAdminClientsQuery,
+  useSetterPipelinesQuery,
+  useSetterLeadsQuery,
+} from "../../hooks/useApi";
+import { useNow } from "../../context/NowContext";
+import SetterBoard from "../../components/admin/setter/SetterBoard";
+import SetterCockpit from "../../components/admin/setter/SetterCockpit";
+import SetterRateStrip from "../../components/admin/SetterRateStrip";
+import type { ApiSetterLead } from "../../lib/api";
+
+// /admin/setter: the Setter Suite. One client's leads worked across every one
+// of that client's pipelines, unfiltered (unlike the client-facing app, which
+// hides retired/system pipelines and stages). Pipeline tabs across the top,
+// the real stage columns underneath, and a docked cockpit (dial logging,
+// tags, booking) on the right whenever a card is selected.
+export default function SetterSuite() {
+  const clientsQuery = useAdminClientsQuery(true);
+  const clients = clientsQuery.data?.clients ?? [];
+
+  const [tenantId, setTenantId] = useState<string | null>(null);
+  const activeTenantId = tenantId ?? clients[0]?.id ?? null;
+  const activeClient = clients.find((c) => c.id === activeTenantId) ?? null;
+
+  const pipelinesQuery = useSetterPipelinesQuery(activeTenantId ?? "", !!activeTenantId);
+  const pipelines = pipelinesQuery.data?.pipelines ?? [];
+
+  const [pipelineId, setPipelineId] = useState<string | null>(null);
+  const activePipelineId = pipelineId ?? pipelines[0]?.id ?? null;
+  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
+
+  const leadsQuery = useSetterLeadsQuery(
+    activeTenantId ?? "",
+    activePipelineId ?? "",
+    !!activeTenantId && !!activePipelineId,
+  );
+
+  const [selectedLead, setSelectedLead] = useState<ApiSetterLead | null>(null);
+  const now = useNow();
+
+  const selectClient = (id: string) => {
+    setTenantId(id);
+    setPipelineId(null);
+    setSelectedLead(null);
+  };
+
+  const selectPipeline = (id: string) => {
+    setPipelineId(id);
+    setSelectedLead(null);
+  };
+
+  const selectLead = (lead: ApiSetterLead) => {
+    setSelectedLead((prev) => (prev?.id === lead.id ? null : lead));
+  };
+
+  const closeCockpit = () => setSelectedLead(null);
+
+  return (
+    <div className="pk-root">
+      <div className="flex flex-wrap items-start justify-between gap-4">
+        <div>
+          <div className="pk-kicker">Sales / Setter Suite</div>
+          <h1 className="pk-title">Setter Suite</h1>
+          <p className="pk-tagline">
+            Work one client&apos;s leads across every pipeline, live from the booking system.
+          </p>
+        </div>
+
+        {clients.length > 0 && (
+          <label className="flex items-center gap-2 text-[13px] text-muted">
+            Client
+            <select
+              className="pk-select"
+              value={activeTenantId ?? ""}
+              onChange={(e) => selectClient(e.target.value)}
+              aria-label="Client"
+            >
+              {clients.map((c) => (
+                <option key={c.id} value={c.id}>
+                  {c.name}
+                </option>
+              ))}
+            </select>
+          </label>
+        )}
+      </div>
+
+      {clientsQuery.isLoading ? (
+        <div className="pk-empty">Loading clients...</div>
+      ) : clientsQuery.isError ? (
+        <div className="pk-empty">Could not load clients.</div>
+      ) : clients.length === 0 ? (
+        <div className="pk-empty">No clients yet.</div>
+      ) : !activeTenantId || !activeClient ? null : (
+        <>
+          <SetterRateStrip leads={leadsQuery.data?.leads ?? []} />
+
+          <nav className="pk-tabs" aria-label="Pipelines">
+            {pipelines.map((p) => (
+              <button
+                key={p.id}
+                type="button"
+                className={`pk-tab${p.id === activePipelineId ? " on" : ""}`}
+                onClick={() => selectPipeline(p.id)}
+              >
+                {p.name}
+              </button>
+            ))}
+          </nav>
+
+          {pipelinesQuery.isLoading ? (
+            <div className="pk-empty">Loading pipelines...</div>
+          ) : pipelinesQuery.isError ? (
+            <div className="pk-empty">Could not load pipelines for {activeClient.name}.</div>
+          ) : !activePipeline ? (
+            <div className="pk-empty">No pipelines found for {activeClient.name}.</div>
+          ) : leadsQuery.isLoading ? (
+            <div className="pk-empty">Loading leads...</div>
+          ) : leadsQuery.isError ? (
+            <div className="pk-empty">Could not load leads for {activePipeline.name}.</div>
+          ) : (
+            <div className="flex items-start gap-4">
+              <div className="min-w-0 flex-1">
+                <SetterBoard
+                  pipeline={activePipeline}
+                  leads={leadsQuery.data?.leads ?? []}
+                  truncated={leadsQuery.data?.truncated ?? false}
+                  now={now}
+                  selectedLeadId={selectedLead?.id ?? null}
+                  onSelectLead={selectLead}
+                />
+              </div>
+              {selectedLead && activeTenantId && (
+                <SetterCockpit
+                  key={selectedLead.id}
+                  tenantId={activeTenantId}
+                  pipelineId={activePipelineId ?? ""}
+                  pipelineName={activePipeline.name}
+                  lead={selectedLead}
+                  onClose={closeCockpit}
+                />
+              )}
+            </div>
+          )}
+        </>
+      )}
+    </div>
+  );
+}
diff --git a/command-center/app/supabase/migrations/0040_setter_dials.sql b/command-center/app/supabase/migrations/0040_setter_dials.sql
new file mode 100644
index 0000000..f349014
--- /dev/null
+++ b/command-center/app/supabase/migrations/0040_setter_dials.sql
@@ -0,0 +1,47 @@
+-- 0040: setter_dials, one row per phone dial for the Setter Suite.
+--
+-- Every per-lead field the Setter board shows (attempt count, first call time,
+-- whether anyone was reached, latest outcome) and every headline rate is
+-- DERIVED from this table by functions/lib/setterMetrics.ts, never stored
+-- redundantly. Append-only by design so history is never lost: a dial is a
+-- fact that already happened and is never edited or deleted after the fact.
+--
+-- tenant_id scopes a dial to the client whose leads were being worked, same
+-- pattern as meta_ad_days. contact_id/opportunity_id are GHL ids (text, not
+-- uuid) matching how the rest of this codebase references GHL records.
+--
+-- outcome is constrained to the fixed set the setter UI offers; a raw text
+-- column with a check constraint keeps it simple to query while still
+-- rejecting typos at write time.
+--
+-- Run AFTER 0001..0039. Idempotent: safe to re-run.
+-- Reached only via the service-role client in Functions (admin session gated
+-- in _middleware.ts).
+
+create table if not exists public.setter_dials (
+  id             uuid primary key default gen_random_uuid(),
+  tenant_id      uuid not null references public.tenants(id) on delete cascade,
+  contact_id     text not null,
+  opportunity_id text,
+  pipeline_name  text,
+  stage_name     text,
+  dialed_at      timestamptz not null default now(),
+  spoke          boolean not null default false,
+  outcome        text not null check (outcome in
+                   ('booked','not_interested','no_answer','reschedule','bad_lead')),
+  note           text,
+  tags_applied   jsonb not null default '[]'::jsonb,
+  created_by     uuid references public.admin_accounts(id) on delete set null,
+  created_at     timestamptz not null default now()
+);
+
+alter table public.setter_dials enable row level security;
+-- No policies: service-role only.
+
+-- The board and cockpit both query by tenant then contact.
+create index if not exists setter_dials_tenant_contact_idx
+  on public.setter_dials (tenant_id, contact_id, dialed_at desc);
+
+-- The metrics roll-up scans a tenant over a date range.
+create index if not exists setter_dials_tenant_dialed_idx
+  on public.setter_dials (tenant_id, dialed_at desc);
diff --git a/docs/build-plans/setter-suite.md b/docs/build-plans/setter-suite.md
new file mode 100644
index 0000000..1c30011
--- /dev/null
+++ b/docs/build-plans/setter-suite.md
@@ -0,0 +1,849 @@
+# Setter Suite: Spec + Implementation Plan
+
+> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
+
+**Goal:** Give the Hauck team one admin screen where a setter works a client's leads across all 8 GHL pipelines, logs every dial, applies tags, and books estimates, so the per-lead ledger Jake specced can actually be measured.
+
+**Architecture:** A new admin-only route under the Sales spine slot. Board of real GHL stage columns on the left, a docked cockpit for the selected lead on the right. Reads come live from GHL per request. The only new persistence is one append-only table of dial events; every per-lead field and every roll-up rate derives from it. All writes to GHL are **tags**, never stage IDs, because the GHL automations own stage movement.
+
+**Tech Stack:** Cloudflare Pages Functions (TypeScript), React 18 + React Router, Tailwind v4 with the existing `.pk-*` admin token layer, Supabase (Management API migrations), Vitest.
+
+---
+
+## Global Constraints
+
+- **Never name GoHighLevel or GHL in any client-facing UI.** This surface is admin-only so internal labels are fine, but no string here may leak into the client app.
+- **Never use an em dash** in code, comments, copy, or UI text.
+- **The client app is not touched.** Zero changes under `src/routes/` or `src/components/` outside the new admin directories. The client's view stays read-only and exactly as it is today.
+- **The app never writes a pipeline stage.** All stage movement is a consequence of a tag. Any code path that PUTs `pipelineStageId` is out of scope and must not be added.
+- **Target is the test account structure** (`r0WfsA12qpBv7M185V3v`), 8 pipelines. Willis (`OznT3yyuwK3dqVXDsCaD`) still runs the old 6-pipeline structure and is explicitly **not** migrated by this work.
+- **Stages and tags are resolved live by name**, never by hardcoded ID. The existing `resolveStageByName` / `resolveCalendarByName` convention applies.
+- Fonts and tokens come from `src/index.css` and the `.pk-kit` layer. Poppins for display, Inter for body, JetBrains Mono for all numerals and timestamps.
+- Money and rate columns use `.tabular-figs`.
+
+---
+
+# Part 1: Spec
+
+## 1.1 Who this is for
+
+The Hauck Marketing team only. Not clients, not client staff. There is deliberately **no per-setter account model in v1** because Jake is currently the only setter. Every dial row still records `created_by` (the admin account id) so per-setter reporting becomes possible later without a migration.
+
+Access is the existing super-admin session. `/api/admin/*` is already gated at `functions/api/_middleware.ts:87-100`.
+
+## 1.2 The 8 pipelines
+
+Pulled live from the test account on 2026-07-20. Stage names are shown exactly as GHL returns them and must be rendered verbatim.
+
+| Pipeline | ID | Stages |
+|---|---|---|
+| Lead Form | `RCyACzwH01bRE5IFFlxg` | Opted In *(needs dialing)*, Hot Lead *(needs dialing)*, Opted In Follow Up, No Answer Day 1-4 *(needs dialing)*, Long Term Nurture |
+| Funnel | `LDN8YJmUgfm17NE4WtQR` | Survey Completed No Call Booked *(needs dialing)*, Survey Follow Up, Phone Appt Booked *(needs dialing)*, No Answer Day 1-4 *(needs dialing)*, Long Term Nurture |
+| Sales | `tnIfXFx8cO88IMvs01ut` | Phone Appt Confirmed, Estimate Booked, Job Booked, Job Completed, Follow Up |
+| Customers | `n9pWlPP6ngO21ycJ2qUd` | One-Time Customer, Recurring Customer |
+| Cancelled Appointments | `S6DacYm6m4e4fz80spGM` | Follow-Up *(needs dialing)*, Rescheduling, Unspecified |
+| Trash | `T1BFJ3GXS4jps2aszcJ5` | Services Uninterested, Services Unqualified |
+| Google Reviews | `mEo0ggVpus8P13SNDkcb` | Asked For Review, Review Link Clicked, Negative Feedback Received, Positive Review Submission |
+| Reactivation | `nf16UDAkcgqLUU8yFq83` | Lead Contacted, Lead Responded, No Answer, Not Qualified |
+
+IDs are recorded here for reference only. **Code resolves by name**, because these IDs are per-location and will differ for every future client.
+
+A stage is flagged "needs dialing" purely by matching `/needs dialing/i` against the live stage name. No mapping table, nothing to maintain. If GHL renames a stage the flag follows automatically.
+
+## 1.3 The data model
+
+Jake's spec is one row per lead with 13 columns. Storing it that way loses history the moment a second dial happens, so the table is **one row per dial** and the per-lead row is derived.
+
+```
+setter_dials
+  id              uuid pk
+  tenant_id       uuid  -> tenants(id)
+  contact_id      text  -- GHL contact id
+  opportunity_id  text  -- GHL opportunity id, nullable
+  pipeline_name   text  -- snapshot at time of dial
+  stage_name      text  -- snapshot at time of dial
+  dialed_at       timestamptz
+  spoke           boolean  -- did a human answer
+  outcome         text     -- booked | not_interested | no_answer | reschedule | bad_lead
+  note            text
+  tags_applied    jsonb    -- tags this dial pushed to GHL, for audit
+  created_by      uuid  -> admin_accounts(id)
+  created_at      timestamptz
+```
+
+Derivation of Jake's 13 columns:
+
+| Column | Source |
+|---|---|
+| Date lead in | GHL `createdAt` on the opportunity |
+| Name, Phone | GHL contact |
+| City / Area | GHL contact address, regex-scraped like `sales/jobs/index.ts:194-201` |
+| Source | Which pipeline the lead sits in, plus the source tag |
+| First call time | `min(dialed_at)` for that contact |
+| Call attempts | `count(*)` for that contact |
+| Contacted Y/N | `bool_or(spoke)` for that contact |
+| Outcome | `outcome` of the most recent dial |
+| Estimate date/time | GHL appointment, via the existing appointments lib |
+| Showed Y/N | **Not available.** Comes from the Estimate Close-out flow, which is not built |
+| Won job Y/N | **Not available.** Comes from the Job Close-out flow, which is not built |
+| Notes | The dial rows themselves, rendered as a timeline |
+
+`spoke` is stored explicitly rather than inferred from `outcome`, because "Bad lead" is ambiguous (a wrong number is not a conversation, a tyre-kicker is). The UI defaults it from the outcome button and the setter can override.
+
+## 1.4 The five rates
+
+| Rate | Formula | Live on day one? |
+|---|---|---|
+| Total leads in | count of opportunities created in range | **Yes.** Pure GHL |
+| Contact rate | contacts with any `spoke=true` dial ÷ total leads | No. Needs dial logging |
+| Booking rate | leads with an appointment ÷ total leads | **Yes.** Pure GHL |
+| Show rate | showed ÷ booked | No. Needs Estimate Close-out |
+| Close rate | won ÷ showed | No. Needs Job Close-out |
+
+This is stated plainly so nobody is surprised when three of five tiles read "Not yet wired" on launch day. That is the existing `.pk-report-tile.pk-pending` pattern and it is the honest thing to render.
+
+## 1.5 Writes
+
+**Tags.** Add is proven live already at `functions/api/reviews/index.ts:170` (`POST /contacts/{id}/tags`, body `{tags:[...]}`). Remove is `DELETE /contacts/{id}/tags` with body `{tags:[...]}` and is **unproven**. Task 0 exists solely to prove it before Task 5 builds on it.
+
+The cockpit shows the lead's current tags as removable chips plus a free input over the location's live tag list. There is no curated button-to-tag mapping to maintain: what the setter picks is what GHL receives.
+
+**Booking.** Reuses `functions/api/lib/appointments.ts` wholesale: `resolveCalendarByName`, `getFreeSlots`, `createAppointment`. That lib already handles the calendars API needing `Version: 2021-04-15` rather than the `2021-07-28` the shared `ghlFetch` pins, and it deliberately does not retry POSTs to avoid double-booking. Do not re-implement any of it.
+
+## 1.6 Known constraints, discovered during verification
+
+1. **Admin routes have no tenant context.** `_middleware.ts:87-100` returns early for `/api/admin/*` with no GHL client. There is no shared helper for this. Three existing admin routes each hand-roll the same `tenants` select. Task 1 extracts it once.
+2. **List endpoints omit tags.** `functions/lib/ghl.ts:108-110` drops `tags` and `attribution` from list results for cost. Showing tags on board cards would be an N+1 contact fetch across the whole board. **Therefore board cards do not show tags.** Tags appear in the cockpit only, where it is one lead and one fetch.
+3. **Opportunity fetch caps at 1000.** `fetchAllOpportunities` defaults `maxPages: 10` at 100 per page and warns on cap (`ghl.ts:183`). Acceptable for now, but the board must surface the warning rather than silently truncate.
+4. **No per-client calendar mapping exists.** Calendars are resolved by name at request time and the names are passed from the caller. The Automation Library's "map an Estimate calendar and a Job calendar per client" step is net-new and is **out of scope here**; v1 resolves by the name the setter picks.
+5. **Migration numbering is a race.** Current max is `0026_tenant_ga4_property.sql`, and `0012` is already duplicated. Re-check the max immediately before creating the file.
+6. **No test harness exists for GHL write paths.** Nothing under `functions/api/appointments/`, `functions/api/sales/`, or `functions/api/lib/` has tests. This plan sets that pattern.
+
+## 1.7 Out of scope
+
+- Migrating Willis to the new pipeline structure
+- Per-setter accounts and per-setter leaderboards
+- Inline SMS or email (GHL keeps comms, per the standing baseline)
+- The Estimate and Job Close-out flows, and therefore Show rate and Close rate
+- Per-client calendar mapping config
+- Any change to the client-facing app
+
+---
+
+# Part 2: Implementation Plan
+
+## File structure
+
+**Create**
+- `command-center/app/supabase/migrations/0027_setter_dials.sql`
+- `command-center/app/functions/lib/tenantGhl.ts` + `.test.ts` — the missing shared helper
+- `command-center/app/functions/lib/setterMetrics.ts` + `.test.ts` — pure derivation, no I/O
+- `command-center/app/functions/api/admin/setter/pipelines.ts`
+- `command-center/app/functions/api/admin/setter/leads.ts`
+- `command-center/app/functions/api/admin/setter/lead/[contactId].ts`
+- `command-center/app/functions/api/admin/setter/dials.ts` + `.test.ts`
+- `command-center/app/functions/api/admin/setter/tags.ts` + `.test.ts`
+- `command-center/app/functions/api/admin/setter/slots.ts`
+- `command-center/app/functions/api/admin/setter/book.ts`
+- `command-center/app/src/routes/admin/SetterSuite.tsx`
+- `command-center/app/src/components/admin/setter/SetterBoard.tsx`
+- `command-center/app/src/components/admin/setter/SetterCard.tsx`
+- `command-center/app/src/components/admin/setter/SetterCockpit.tsx`
+- `command-center/app/src/components/admin/setter/DialLogger.tsx`
+- `command-center/app/src/components/admin/setter/TagField.tsx`
+- `command-center/app/src/components/admin/setter/SlotPicker.tsx`
+- `command-center/app/src/lib/setterModel.ts` + `.test.ts` — shared types, `needsDialing()`
+
+**Modify**
+- `command-center/app/src/App.tsx` — register `/admin/setter`
+- `command-center/app/src/routes/admin/AdminLayout.tsx` — point the Sales spine slot at it
+
+**Refactor to use the new helper (Task 1)**
+- `functions/api/admin/onboarding/[tenantId]/readiness.ts:12-22`
+- `functions/api/admin/clients/[tenantId]/import-staff.ts:21-43`
+
+---
+
+### Task 0: Prove the tag remove endpoint
+
+Blocking spike. Everything in Task 7 assumes this works. The CLI's implementation drops the body, so it is not evidence.
+
+**Files:** none. This is a manual verification.
+
+- [ ] **Step 1: Pick a throwaway contact in the test account**
+
+Use the internal-API method that worked on 2026-07-20 (Firebase refresh token plus `Version: 2021-07-28`), or the public API if a test-account PIT is available. Note the contact id and its current tags.
+
+- [ ] **Step 2: Add a tag, confirm it lands**
+
+```
+POST /contacts/{contactId}/tags
+{"tags":["setter suite probe"]}
+```
+Expected: 200, and a re-read of the contact shows the tag.
+
+- [ ] **Step 3: Remove it with a body, confirm it goes**
+
+```
+DELETE /contacts/{contactId}/tags
+{"tags":["setter suite probe"]}
+```
+Expected: 200, and a re-read shows the tag gone.
+
+- [ ] **Step 4: Record the result in this file**
+
+If DELETE-with-body does not work, stop and report. The fallback is read-modify-write on the contact's full tag array, which is lossy under concurrency and changes the design of Task 7.
+
+---
+
+### Task 1: Shared tenant-to-GHL helper
+
+**Files:**
+- Create: `command-center/app/functions/lib/tenantGhl.ts`
+- Test: `command-center/app/functions/lib/tenantGhl.test.ts`
+- Modify: `functions/api/admin/onboarding/[tenantId]/readiness.ts:12-22`
+- Modify: `functions/api/admin/clients/[tenantId]/import-staff.ts:21-43`
+
+**Interfaces:**
+- Consumes: `getServiceClient` from `functions/lib/supabase.ts`, `GhlContext` from `functions/lib/ghl.ts`
+- Produces: `getGhlContextForTenant(env, tenantId): Promise<GhlContext>`, throws `TenantGhlError` with `.status` and `.code`
+
+- [ ] **Step 1: Write the failing test**
+
+```ts
+import { describe, it, expect } from "vitest";
+import { isPlaceholder } from "./tenantGhl";
+
+describe("isPlaceholder", () => {
+  it("rejects the three known placeholder values", () => {
+    expect(isPlaceholder("")).toBe(true);
+    expect(isPlaceholder("pending")).toBe(true);
+    expect(isPlaceholder("env")).toBe(true);
+  });
+  it("accepts a real value", () => {
+    expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
+  });
+  it("treats null and undefined as placeholder", () => {
+    expect(isPlaceholder(null)).toBe(true);
+    expect(isPlaceholder(undefined)).toBe(true);
+  });
+});
+```
+
+- [ ] **Step 2: Run it and watch it fail**
+
+Run: `cd command-center/app && npx vitest run functions/lib/tenantGhl.test.ts`
+Expected: FAIL, cannot resolve `./tenantGhl`.
+
+- [ ] **Step 3: Implement**
+
+```ts
+import { getServiceClient } from "./supabase";
+import type { GhlContext } from "./ghl";
+
+const PLACEHOLDERS = new Set(["", "pending", "env"]);
+
+export function isPlaceholder(v: string | null | undefined): boolean {
+  return v == null || PLACEHOLDERS.has(v.trim().toLowerCase());
+}
+
+export class TenantGhlError extends Error {
+  constructor(readonly status: number, readonly code: string, message: string) {
+    super(message);
+  }
+}
+
+// Admin routes run above tenant resolution (functions/api/_middleware.ts:87-100),
+// so ctx.data.tenant is never populated. This is the one place that turns a
+// tenantId into a usable GHL context. Note getTenantById in adminAuth.ts
+// deliberately omits ghl_token, so it cannot be used here.
+export async function getGhlContextForTenant(env: any, tenantId: string): Promise<GhlContext> {
+  const client = getServiceClient(env);
+  const { data, error } = await client
+    .from("tenants")
+    .select("ghl_location_id, ghl_token")
+    .eq("id", tenantId)
+    .maybeSingle();
+
+  if (error) throw new TenantGhlError(500, "tenant_lookup_failed", error.message);
+  if (!data) throw new TenantGhlError(404, "tenant_not_found", "No such client.");
+  if (isPlaceholder(data.ghl_location_id) || isPlaceholder(data.ghl_token)) {
+    throw new TenantGhlError(400, "ghl_not_connected", "Connect this client to the booking system first.");
+  }
+  return { token: data.ghl_token, locationId: data.ghl_location_id };
+}
+```
+
+- [ ] **Step 4: Run the test, watch it pass**
+
+Run: `npx vitest run functions/lib/tenantGhl.test.ts`
+Expected: PASS, 3 tests.
+
+- [ ] **Step 5: Refactor the two existing call sites onto it**
+
+Replace the hand-rolled select in `readiness.ts:12-22` and `import-staff.ts:21-43` with `getGhlContextForTenant`, catching `TenantGhlError` and returning `{ error: e.code }` at `e.status`. Preserve each route's existing response shape exactly.
+
+- [ ] **Step 6: Full suite plus typecheck**
+
+Run: `npm test && npm run typecheck`
+Expected: all green, no new failures.
+
+- [ ] **Step 7: Commit**
+
+```bash
+git add command-center/app/functions/lib/tenantGhl.ts command-center/app/functions/lib/tenantGhl.test.ts command-center/app/functions/api/admin/onboarding/ command-center/app/functions/api/admin/clients/
+git commit -m "refactor(admin): extract getGhlContextForTenant, the missing shared helper"
+```
+
+---
+
+### Task 2: The setter_dials table
+
+**Files:**
+- Create: `command-center/app/supabase/migrations/0027_setter_dials.sql`
+
+- [ ] **Step 1: Re-check the migration number**
+
+Run: `ls command-center/app/supabase/migrations/ | sort | tail -3`
+If the max is no longer `0026`, rename accordingly. This numbering has collided before.
+
+- [ ] **Step 2: Read 0026 for conventions**
+
+Read `command-center/app/supabase/migrations/0026_tenant_ga4_property.sql` and match its RLS and grant style exactly. Do not invent a different convention.
+
+- [ ] **Step 3: Write the migration**
+
+```sql
+-- Setter Suite: one row per dial. Every per-lead field and every roll-up rate
+-- derives from this table. Append-only by design so history is never lost.
+create table if not exists public.setter_dials (
+  id             uuid primary key default gen_random_uuid(),
+  tenant_id      uuid not null references public.tenants(id) on delete cascade,
+  contact_id     text not null,
+  opportunity_id text,
+  pipeline_name  text,
+  stage_name     text,
+  dialed_at      timestamptz not null default now(),
+  spoke          boolean not null default false,
+  outcome        text not null check (outcome in
+                   ('booked','not_interested','no_answer','reschedule','bad_lead')),
+  note           text,
+  tags_applied   jsonb not null default '[]'::jsonb,
+  created_by     uuid references public.admin_accounts(id) on delete set null,
+  created_at     timestamptz not null default now()
+);
+
+-- The board and cockpit both query by tenant then contact.
+create index if not exists setter_dials_tenant_contact_idx
+  on public.setter_dials (tenant_id, contact_id, dialed_at desc);
+
+-- The metrics roll-up scans a tenant over a date range.
+create index if not exists setter_dials_tenant_dialed_idx
+  on public.setter_dials (tenant_id, dialed_at desc);
+
+alter table public.setter_dials enable row level security;
+-- No policies: every read and write goes through the service client inside
+-- Pages Functions, behind the admin session gate. Anon and authenticated
+-- roles get nothing.
+```
+
+- [ ] **Step 4: Apply it**
+
+Run: `cd command-center/app && npm run db:migrate`
+Expected: `0027_setter_dials.sql` reported applied, and it appears in `public._hml_migrations`.
+
+- [ ] **Step 5: Prove it is idempotent**
+
+Run: `npm run db:migrate` again.
+Expected: skipped, no error.
+
+- [ ] **Step 6: Commit**
+
+```bash
+git add command-center/app/supabase/migrations/0027_setter_dials.sql
+git commit -m "feat(setter): add setter_dials, the per-dial event table"
+```
+
+---
+
+### Task 3: Metric derivation, pure and tested
+
+The riskiest logic in the feature, and the cheapest to test because it touches nothing.
+
+**Files:**
+- Create: `command-center/app/functions/lib/setterMetrics.ts`
+- Test: `command-center/app/functions/lib/setterMetrics.test.ts`
+
+**Interfaces:**
+- Produces: `rollUpByContact(dials): Map<string, ContactRollUp>`, `computeRates(leads, rollUps, appointments): Rates`
+- `ContactRollUp = { attempts: number; firstDialedAt: string | null; contacted: boolean; lastOutcome: string | null }`
+- `Rates = { totalLeads: number; contactRate: number | null; bookingRate: number | null; showRate: null; closeRate: null }`
+
+`showRate` and `closeRate` are typed `null` deliberately. They cannot be computed until the close-out flows exist, and typing them `null` makes any attempt to fake them a type error.
+
+- [ ] **Step 1: Write the failing tests**
+
+```ts
+import { describe, it, expect } from "vitest";
+import { rollUpByContact, computeRates } from "./setterMetrics";
+
+const dial = (contact: string, at: string, spoke: boolean, outcome: string) =>
+  ({ contact_id: contact, dialed_at: at, spoke, outcome });
+
+describe("rollUpByContact", () => {
+  it("counts attempts and takes the earliest dial as first call", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T14:00:00Z", false, "no_answer"),
+      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
+      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
+    ]);
+    expect(r.get("c1")!.attempts).toBe(3);
+    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
+  });
+
+  it("marks contacted when any dial spoke, regardless of order", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T09:00:00Z", true, "not_interested"),
+      dial("c1", "2026-07-20T10:00:00Z", false, "no_answer"),
+    ]);
+    expect(r.get("c1")!.contacted).toBe(true);
+  });
+
+  it("takes the outcome of the most recent dial, not the last in the array", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
+      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
+    ]);
+    expect(r.get("c1")!.lastOutcome).toBe("booked");
+  });
+
+  it("keeps contacts separate", () => {
+    const r = rollUpByContact([
+      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
+      dial("c2", "2026-07-20T09:00:00Z", false, "no_answer"),
+    ]);
+    expect(r.get("c1")!.contacted).toBe(true);
+    expect(r.get("c2")!.contacted).toBe(false);
+  });
+});
+
+describe("computeRates", () => {
+  it("returns null rates rather than NaN when there are no leads", () => {
+    const r = computeRates([], new Map(), []);
+    expect(r.totalLeads).toBe(0);
+    expect(r.contactRate).toBeNull();
+    expect(r.bookingRate).toBeNull();
+  });
+
+  it("counts a lead as contacted only via its own roll-up", () => {
+    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
+    const rollUps = rollUpByContact([dial("c1", "2026-07-20T09:00:00Z", true, "booked")]);
+    const r = computeRates(leads, rollUps, []);
+    expect(r.totalLeads).toBe(2);
+    expect(r.contactRate).toBeCloseTo(0.5);
+  });
+
+  it("never computes show or close rate", () => {
+    const r = computeRates([{ contactId: "c1" }], new Map(), [{ contactId: "c1" }]);
+    expect(r.showRate).toBeNull();
+    expect(r.closeRate).toBeNull();
+  });
+});
+```
+
+- [ ] **Step 2: Run and watch them fail**
+
+Run: `npx vitest run functions/lib/setterMetrics.test.ts`
+Expected: FAIL, cannot resolve `./setterMetrics`.
+
+- [ ] **Step 3: Implement**
+
+```ts
+export type DialRow = {
+  contact_id: string;
+  dialed_at: string;
+  spoke: boolean;
+  outcome: string;
+};
+
+export type ContactRollUp = {
+  attempts: number;
+  firstDialedAt: string | null;
+  contacted: boolean;
+  lastOutcome: string | null;
+};
+
+export function rollUpByContact(dials: DialRow[]): Map<string, ContactRollUp> {
+  const out = new Map<string, ContactRollUp>();
+  // Input sort order is not trusted, so the latest timestamp per contact is
+  // tracked alongside rather than assumed from array position.
+  const latestAt = new Map<string, string>();
+
+  for (const d of dials) {
+    const cur = out.get(d.contact_id) ?? {
+      attempts: 0, firstDialedAt: null, contacted: false, lastOutcome: null,
+    };
+    cur.attempts += 1;
+    if (cur.firstDialedAt === null || d.dialed_at < cur.firstDialedAt) {
+      cur.firstDialedAt = d.dialed_at;
+    }
+    const seen = latestAt.get(d.contact_id);
+    if (seen === undefined || d.dialed_at >= seen) {
+      cur.lastOutcome = d.outcome;
+      latestAt.set(d.contact_id, d.dialed_at);
+    }
+    if (d.spoke) cur.contacted = true;
+    out.set(d.contact_id, cur);
+  }
+  return out;
+}
+
+export type Rates = {
+  totalLeads: number;
+  contactRate: number | null;
+  bookingRate: number | null;
+  showRate: null;
+  closeRate: null;
+};
+
+export function computeRates(
+  leads: { contactId: string }[],
+  rollUps: Map<string, ContactRollUp>,
+  appointments: { contactId: string }[],
+): Rates {
+  const total = leads.length;
+  if (total === 0) {
+    return { totalLeads: 0, contactRate: null, bookingRate: null, showRate: null, closeRate: null };
+  }
+  const contacted = leads.filter((l) => rollUps.get(l.contactId)?.contacted).length;
+  const booked = new Set(appointments.map((a) => a.contactId));
+  const bookedLeads = leads.filter((l) => booked.has(l.contactId)).length;
+  return {
+    totalLeads: total,
+    contactRate: contacted / total,
+    bookingRate: bookedLeads / total,
+    // Both require the Estimate and Job Close-out flows, which do not exist.
+    showRate: null,
+    closeRate: null,
+  };
+}
+```
+
+- [ ] **Step 4: Run, watch pass**
+
+Run: `npx vitest run functions/lib/setterMetrics.test.ts`
+Expected: PASS, 7 tests.
+
+- [ ] **Step 5: Commit**
+
+```bash
+git add command-center/app/functions/lib/setterMetrics.ts command-center/app/functions/lib/setterMetrics.test.ts
+git commit -m "feat(setter): derive per-contact roll-ups and rates from dial events"
+```
+
+---
+
+### Task 4: Read endpoints, pipelines and board
+
+**Files:**
+- Create: `functions/api/admin/setter/pipelines.ts`
+- Create: `functions/api/admin/setter/leads.ts`
+
+**Interfaces:**
+- Consumes: `getGhlContextForTenant` (Task 1), `fetchAllOpportunities` and `ghlJson` from `functions/lib/ghl.ts`
+- Produces: `GET /api/admin/setter/pipelines?tenantId=` → `{ pipelines: [{ id, name, stages: [{ id, name, color, needsDialing }] }] }`
+- Produces: `GET /api/admin/setter/leads?tenantId=&pipelineId=` → `{ leads: ApiSetterLead[], truncated: boolean }`
+
+`ApiSetterLead = { id, contactId, name, phone, city, stageName, createdAt, attempts, firstDialedAt, contacted, lastOutcome }`
+
+Note what is absent: **no `tags` field.** The list endpoint cannot supply it without an N+1 per card (`ghl.ts:108-110`). Tags come from the detail endpoint in Task 5.
+
+- [ ] **Step 1: Implement pipelines.ts**
+
+Fetch `/opportunities/pipelines?locationId=`, sort stages by `position`, and set `needsDialing: /needs dialing/i.test(stage.name)`. Return all 8, unfiltered: unlike the client `PipelinesContext`, the setter view hides nothing.
+
+- [ ] **Step 2: Implement leads.ts**
+
+Call `fetchAllOpportunities(gctx, { pipelineId })`. Set `truncated: true` when the page cap is hit so the UI can say so rather than silently lie. Then in one query fetch every `setter_dials` row for that tenant and those contact ids, run `rollUpByContact`, and merge.
+
+- [ ] **Step 3: Verify against the live test account**
+
+Run the dev server and curl both endpoints with a real admin session and the test account tenant id. Expected: 8 pipelines, and stage names matching section 1.2 of this document character for character, emoji included.
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add command-center/app/functions/api/admin/setter/
+git commit -m "feat(setter): read endpoints for pipelines and board leads"
+```
+
+---
+
+### Task 5: Cockpit detail, dial logging, and tags
+
+**Files:**
+- Create: `functions/api/admin/setter/lead/[contactId].ts`
+- Create: `functions/api/admin/setter/dials.ts` + `.test.ts`
+- Create: `functions/api/admin/setter/tags.ts` + `.test.ts`
+
+**Interfaces:**
+- `GET /api/admin/setter/lead/:contactId?tenantId=` → contact detail plus `tags: string[]` plus `dials: DialRow[]` ordered newest first
+- `POST /api/admin/setter/dials` body `{ tenantId, contactId, opportunityId?, pipelineName, stageName, spoke, outcome, note?, tagsApplied? }` → `{ dial }`
+- `POST /api/admin/setter/tags` body `{ tenantId, contactId, add?: string[], remove?: string[] }` → `{ tags }`
+
+- [ ] **Step 1: Write the failing validation tests for dials.ts**
+
+```ts
+import { describe, it, expect } from "vitest";
+import { validateDialBody } from "./dials";
+
+describe("validateDialBody", () => {
+  it("rejects an outcome outside the five allowed values", () => {
+    const r = validateDialBody({ tenantId: "t", contactId: "c", spoke: true, outcome: "maybe" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("bad_outcome");
+  });
+  it("accepts each of the five allowed outcomes", () => {
+    for (const o of ["booked","not_interested","no_answer","reschedule","bad_lead"]) {
+      expect(validateDialBody({ tenantId:"t", contactId:"c", spoke:false, outcome:o }).ok).toBe(true);
+    }
+  });
+  it("requires tenantId and contactId", () => {
+    expect(validateDialBody({ contactId: "c", spoke: true, outcome: "booked" }).ok).toBe(false);
+    expect(validateDialBody({ tenantId: "t", spoke: true, outcome: "booked" }).ok).toBe(false);
+  });
+  it("rejects a no_answer that claims someone spoke", () => {
+    const r = validateDialBody({ tenantId:"t", contactId:"c", spoke:true, outcome:"no_answer" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("contradictory");
+  });
+});
+```
+
+That last case matters: it is the one way the Contact rate can be silently corrupted.
+
+- [ ] **Step 2: Run, watch fail**
+
+Run: `npx vitest run functions/api/admin/setter/dials.test.ts`
+Expected: FAIL, `validateDialBody` is not exported.
+
+- [ ] **Step 3: Implement `validateDialBody` and the POST handler**
+
+Export the validator separately from the handler so it is testable without a request. The handler resolves the admin via `getActiveAdmin`, writes the row with `created_by`, and calls `logAdminAction`.
+
+- [ ] **Step 4: Run, watch pass**
+
+Run: `npx vitest run functions/api/admin/setter/dials.test.ts`
+Expected: PASS, 4 tests.
+
+- [ ] **Step 5: Implement tags.ts using the shape proven in Task 0**
+
+```ts
+// Add is proven live (functions/api/reviews/index.ts:170). Remove was proven
+// in Task 0. Do not copy the CLI's remove: it omits the body entirely.
+if (add?.length) {
+  await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`,
+    { method: "POST", body: JSON.stringify({ tags: add }) });
+}
+if (remove?.length) {
+  await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`,
+    { method: "DELETE", body: JSON.stringify({ tags: remove }) });
+}
+```
+
+Re-read the contact afterwards and return its actual tag list, rather than echoing what was asked for. The setter must see what GHL really holds, because those tags fire workflows.
+
+- [ ] **Step 6: Full suite plus typecheck, then commit**
+
+```bash
+npm test && npm run typecheck
+git add command-center/app/functions/api/admin/setter/
+git commit -m "feat(setter): lead detail, dial logging, and tag add/remove"
+```
+
+---
+
+### Task 6: Booking, on top of the existing appointments lib
+
+**Files:**
+- Create: `functions/api/admin/setter/slots.ts`
+- Create: `functions/api/admin/setter/book.ts`
+
+- [ ] **Step 1: Read the existing lib first**
+
+Read `functions/api/lib/appointments.ts` in full, and `functions/api/appointments/slots.ts` as the closest existing caller. Reuse `resolveCalendarByName`, `getFreeSlots` and `createAppointment` unchanged. Do not re-implement the calendars `Version: 2021-04-15` handling.
+
+- [ ] **Step 2: Implement slots.ts**
+
+`GET ?tenantId=&calendarName=&days=` proxying `getFreeSlots`. Surface `needsStaff: true` straight through: a round-robin calendar with no team members returns a 422 and the setter needs to see that plainly, not an empty grid.
+
+- [ ] **Step 3: Implement book.ts**
+
+`POST { tenantId, calendarName, contactId, startTime, endTime, title? }`. Do not retry on failure. The lib deliberately avoids retrying POSTs to prevent double-booking and this endpoint must honour that.
+
+- [ ] **Step 4: Verify against the test account**
+
+Book a real slot on a test calendar, confirm in GHL, then cancel it there.
+
+- [ ] **Step 5: Commit**
+
+```bash
+git add command-center/app/functions/api/admin/setter/
+git commit -m "feat(setter): live slot lookup and booking via the existing appointments lib"
+```
+
+---
+
+### Task 7: The board
+
+**Files:**
+- Create: `src/lib/setterModel.ts` + `.test.ts`
+- Create: `src/components/admin/setter/SetterCard.tsx`
+- Create: `src/components/admin/setter/SetterBoard.tsx`
+- Create: `src/routes/admin/SetterSuite.tsx`
+- Modify: `src/App.tsx`, `src/routes/admin/AdminLayout.tsx`
+
+- [ ] **Step 1: Write the failing test for `needsDialing`**
+
+```ts
+import { describe, it, expect } from "vitest";
+import { needsDialing } from "./setterModel";
+
+describe("needsDialing", () => {
+  it("matches the live stage names case-insensitively", () => {
+    expect(needsDialing("Opted In (needs dialing)")).toBe(true);
+    expect(needsDialing("No Answer Day 4 (Needs Dialing)")).toBe(true);
+  });
+  it("does not match stages without the marker", () => {
+    expect(needsDialing("Long Term Nurture")).toBe(false);
+    expect(needsDialing("Estimate Booked")).toBe(false);
+  });
+});
+```
+
+- [ ] **Step 2: Run, fail, implement, run, pass**
+
+Run: `npx vitest run src/lib/setterModel.test.ts`
+
+```ts
+export const needsDialing = (stageName: string): boolean => /needs dialing/i.test(stageName);
+```
+
+- [ ] **Step 3: Build the board to match the approved mockup**
+
+Column header is the stage dot in the live GHL hex plus the verbatim stage name plus a count, exactly the pattern in `src/components/Board.tsx`. The stage hex is a dot only, never a background or text colour. Add the "needs dialing" chip under the header for flagged stages.
+
+Card shows name, city, time in, a source chip, and an attempts badge. **No tags on the card.** Cards with `attempts === 0` get the danger inset rail; cards untouched for over 24 hours in a needs-dialing stage get the warning rail.
+
+- [ ] **Step 4: Show truncation honestly**
+
+When the leads endpoint returns `truncated: true`, render a visible banner saying the list is capped at 1000. Never silently drop leads.
+
+- [ ] **Step 5: Register the route and point the Sales spine slot at it**
+
+- [ ] **Step 6: Full suite, typecheck, commit**
+
+```bash
+npm test && npm run typecheck
+git add command-center/app/src/
+git commit -m "feat(setter): pipeline board across all 8 pipelines"
+```
+
+---
+
+### Task 8: The cockpit
+
+**Files:**
+- Create: `src/components/admin/setter/SetterCockpit.tsx`
+- Create: `src/components/admin/setter/DialLogger.tsx`
+- Create: `src/components/admin/setter/TagField.tsx`
+- Create: `src/components/admin/setter/SlotPicker.tsx`
+
+- [ ] **Step 1: Cockpit shell, docked right, own scroll container**
+
+Sections in the order a real call happens: identity and dial, outcome, tags, booking, history, notes. The board keeps its own scroll position while the cockpit scrolls independently.
+
+- [ ] **Step 2: DialLogger**
+
+Five outcome buttons matching Jake's set exactly: Booked, Not interested, No answer, Reschedule, Bad lead. Picking one sets `spoke` automatically (No answer sets false, the rest set true) with a visible override, because the API rejects the contradictory combination.
+
+- [ ] **Step 3: TagField**
+
+Current tags as removable chips, a free input over the location's live tag list, and a short suggestion row. Under it, one line of honest warning copy: applying a tag fires the workflows.
+
+- [ ] **Step 4: SlotPicker**
+
+Day selector plus a grid of live slots. Render the `needsStaff` case as explicit copy: "This calendar has no team members assigned, so it cannot return availability."
+
+- [ ] **Step 5: Optimistic update, with rollback**
+
+A logged dial appears in the timeline immediately and increments the card's attempt badge. On failure it rolls back and a toast explains why. Never leave a phantom dial on screen: the attempt count is a metric.
+
+- [ ] **Step 6: Full suite, typecheck, commit**
+
+```bash
+npm test && npm run typecheck
+git add command-center/app/src/components/admin/setter/
+git commit -m "feat(setter): lead cockpit with dial logging, tags, and booking"
+```
+
+---
+
+### Task 9: The metric strip, honestly
+
+**Files:**
+- Modify: `src/routes/admin/SetterSuite.tsx`
+
+- [ ] **Step 1: Render the five tiles**
+
+Total leads in, Contact rate, Booking rate, Show rate, Close rate, each with its formula as a mono sub-label so nobody has to guess what it means.
+
+- [ ] **Step 2: Render the unavailable ones as pending, not as zero**
+
+Show rate and Close rate use the existing `.pk-report-tile.pk-pending` treatment and read "Needs close-out flow". A zero would be a lie: the data does not exist, it is not that the number is zero.
+
+- [ ] **Step 3: Commit**
+
+```bash
+git add command-center/app/src/routes/admin/SetterSuite.tsx
+git commit -m "feat(setter): rate strip, with unavailable rates marked pending"
+```
+
+---
+
+### Task 10: Ship
+
+- [ ] **Step 1: Full verification**
+
+Run: `npm test && npm run typecheck && npm run build`
+Expected: all green. Record the built bundle hash.
+
+- [ ] **Step 2: Push and watch the deploy**
+
+- [ ] **Step 3: Verify the served bundle matches the build**
+
+Per the standing rule: assert the served bundle hash matches the fresh build before trusting any browser check. Poll for a distinctive string, not the local hash, because Cloudflare builds a different one.
+
+- [ ] **Step 4: Smoke test live**
+
+Log in as admin, open the Setter Suite against the test account, confirm all 8 pipelines render with correct stage names. Log one real dial. Add and remove one real tag. Confirm both in GHL.
+
+- [ ] **Step 5: Delete the mockup file and update the architecture map**
+
+```bash
+rm "C:/Users/games/Desktop/setter-suite-mockups.html"
+```
+Update `blueprint/index.html` NODES and GAPS per the standing rule.
+
+- [ ] **Step 6: Delete this plan**
+
+Per the standing rule that shipped build plans are removed in the same commit, and append any outstanding Jake actions to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md` first.
+
+---
+
+## What Jake owes
+
+1. Confirm whether tag remove works (Task 0 will tell us, but if it fails Jake's call on the fallback).
+2. Log dials consistently for at least two weeks, or Contact rate stays meaningless.
+3. Decide when the Estimate and Job Close-out flows get built, since Show rate and Close rate are blocked behind them.
+4. Decide when Willis migrates to the new 8-pipeline structure.
```
