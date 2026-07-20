# Task 7 report: the board

## Files created

- `command-center/app/src/lib/setterModel.ts` — pure model helpers: `needsDialing`,
  `isStaleUncontacted`, `cardRail`, `formatOutcome`. No I/O.
- `command-center/app/src/lib/setterModel.test.ts` — 11 tests (the given `needsDialing`
  suite verbatim, plus `isStaleUncontacted`, `cardRail`, `formatOutcome`).
- `command-center/app/src/components/admin/setter/SetterCard.tsx` — one board card.
- `command-center/app/src/components/admin/setter/SetterBoard.tsx` — one pipeline's
  stage columns.
- `command-center/app/src/routes/admin/SetterSuite.tsx` — the page shell (`/admin/setter`):
  client picker, pipeline tabs, board.

## Files modified

- `command-center/app/src/App.tsx` — imports `SetterSuite`, registers
  `<Route path="/admin/setter" element={<AdminRoute><SetterSuite /></AdminRoute>} />`.
- `command-center/app/src/routes/admin/AdminLayout.tsx` — `SPINE_NAV`'s "Sales" entry now
  points at `/admin/setter` instead of `/admin/pillar/sales`. The old Sales Data pillar tab
  is untouched and still reachable by direct URL; only the spine icon was re-pointed, per
  the plan's literal instruction ("point the Sales spine slot at it").
- `command-center/app/src/lib/api.ts` — added `ApiSetterStage`, `ApiSetterPipeline`,
  `ApiSetterLead`, `ApiSetterLeadsResponse` (wire types mirroring the two GET endpoints
  exactly, not touched otherwise).
- `command-center/app/src/hooks/useApi.ts` — added `useSetterPipelinesQuery(tenantId, enabled)`
  and `useSetterLeadsQuery(tenantId, pipelineId, enabled)`, following the existing
  `useAdminClientsQuery` pattern (staleTime, queryKey shape).

**Deviation from the brief's file list:** the brief's Task 7 file list names only
`src/App.tsx` and `src/routes/admin/AdminLayout.tsx` as modifications. I also touched
`src/lib/api.ts` and `src/hooks/useApi.ts` to add the wire types and TanStack Query hooks
for the two setter GET endpoints. This was necessary (the board has to fetch its data
somehow) and follows the codebase's existing convention exactly (every other admin
surface's types live in `api.ts` and its query hooks live in `useApi.ts`; nothing calls
`fetch`/`api()` directly from a route component elsewhere in admin). Flagging it since it
wasn't in the brief's literal list.

## Design decisions / deviations worth flagging

1. **No "source chip" on the card.** The brief text (and the plan) both say the card
   should show "a source chip." The real `ApiSetterLead` shape (confirmed by reading
   `functions/api/admin/setter/leads.ts`, the actual implementation, not just the summary
   in the task prompt) has no source/attribution field: `id, contactId, name, phone, city,
   stageName, createdAt, attempts, firstDialedAt, contacted, lastOutcome`. The mockup's
   "source chip" ("Facebook Ads", "Lead Form", etc.) was randomly generated fixture data,
   not something the real endpoint returns. Fetching attribution/tags per card would be
   exactly the N+1 the endpoint's own comment says was deliberately avoided. Rather than
   fabricate a source, the card instead shows a **last-outcome chip** (`formatOutcome`,
   title-cased from the `setter_dials` enum) when `lastOutcome` is set, since that's real
   data and useful to a setter. Also added a "Spoke" chip when `contacted` is true. Please
   confirm this reads right, or say if you'd rather the chip slot stay empty until an
   attribution field exists on the endpoint.
2. **Grouping cards by `stageName`, not stage id.** `ApiSetterLead` only carries
   `stageName` (already resolved server-side against live GHL stage names), not a stage
   id. `SetterBoard` groups leads into columns by exact stage-name match against
   `pipeline.stages[].name`. A lead whose name doesn't match any current column (a stale
   fetch, a stage renamed mid-session) is silently dropped from the board rather than
   crashing it or inventing a stray column; that column's own count elsewhere stays correct.
3. **No per-pipeline lead counts on the tabs.** The mockup shows a count badge per pipeline
   tab. Getting real counts for all 8 tabs up front would mean firing all 8 leads requests
   before the admin picks anything. I kept it to one request per selected pipeline (fetched
   lazily on tab click), consistent with the plan's own N+1 avoidance stance elsewhere.
   Tabs show pipeline name only; the per-stage counts inside the active board are real.
4. **Client (tenant) picker is local React state, not a route param.** The brief's file
   list doesn't include a roster/picker component, and the plan's Task 7 scope is "the
   board," not tenant routing. `SetterSuite` pulls `useAdminClientsQuery`, defaults to the
   first client returned, and offers a plain `<select>` (styled with the existing
   `.pk-select` token class) to switch. This is deliberately the simplest thing that lets
   the board be pointed at any client (not hardcoded to test-account), matching "an
   admin-only screen where our team works one client's sales leads." If Task 8's cockpit
   wants URL-addressable tenant state (`/admin/setter/:tenantId`) that's a straightforward
   follow-up; I didn't add it here to avoid guessing at the cockpit's own routing needs.
5. **Card rail priority.** `attempts === 0` (danger) and the 24h-uncontacted-in-a-needs-
   dialing-stage case (warning) can both be true at once (e.g. a lead sitting untouched for
   3 days). `cardRail` picks danger over warning in that case, on the reasoning that "never
   dialed at all" is the more urgent state. Tested explicitly
   (`"danger outranks warning when both conditions hold"`).
6. **Whole-pipeline empty state.** Per-column empty copy is now honest and specific
   ("No leads waiting on a dial." for needs-dialing stages, "No leads in this stage yet."
   otherwise) rather than Board.tsx's bare "Empty." I did not add a separate whole-board
   empty banner on top of that (test-account currently has zero leads in all 8 pipelines,
   so on first load every column will show this text simultaneously, with real stage names,
   dots, and needs-dialing chips still visible above each one) — that seemed like the more
   informative state than collapsing the board into one generic message and losing the
   pipeline structure. Flagging so you can weigh in once you see it live.
7. **Selection is a toggle.** Clicking a selected card deselects it (since there's no
   cockpit yet to give the admin another way to close the selection). Selected state is
   visualized with a `box-shadow` brand ring, composed with the rail's inset shadow when
   both apply (can't stack two Tailwind `shadow-*` classes, so `SetterCard` builds the
   `boxShadow` style string by hand).

## What Task 8 (the cockpit) needs to know

- `SetterSuite` holds `selectedLead: ApiSetterLead | null` and passes
  `onSelectLead={selectLead}` down to `SetterBoard` → `SetterCard`. The seam is exactly
  that piece of state plus the callback; nothing else assumes a cockpit exists yet.
- `now` (from `useNow()`, minute-resolution ms) is threaded down to `SetterBoard`/
  `SetterCard` for both the "time in" display and the rail's 24h computation, matching how
  `Board.tsx` already does it.

## Commands run

```
cd command-center/app
npx vitest run src/lib/setterModel.test.ts   # failed (module missing) before implementation
npx vitest run src/lib/setterModel.test.ts   # 11 passed after implementation
npm run typecheck                             # clean, no errors
npm test -- --run                             # 917 tests passed, 87 files (0 failures)
npm run build                                 # tsc + vite build succeeded
```

### Full `npm test -- --run` tail

```
 Test Files  87 passed (87)
      Tests  917 passed (917)
```

### `npm run typecheck` output

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```
(no output = clean)

### `npm run build` output (tail)

```
✓ 2249 modules transformed.
dist/assets/index-CjIduf8I.css   105.14 kB │ gzip:  18.33 kB
dist/assets/index-hSCN4QbF.js  1,494.47 kB │ gzip: 391.42 kB
✓ built in 4.96s
PWA v1.3.0 ... files generated, dist/sw.js
```

Confirmed by grep that the built bundle actually contains the new page's strings
(`"Setter Suite"`, `"Never dialed"`, `"Needs dialing"`, `"Showing the first 1,000 leads"`),
so this isn't a stale/cached build.

## What I could not verify

No one can drive this UI through a real admin session in this environment (minting an
admin session is classifier-blocked, the same limitation recorded against every other admin
surface in this project's memory). So the following are **unverified, code-reviewed and
type-checked only**:

- That the page actually renders correctly in a browser, light and dark theme both.
- That the client picker, pipeline tabs, and board interact correctly against a live
  `/admin/setter/pipelines` + `/admin/setter/leads` response (I read the real backend
  route/response shapes and matched them exactly, but never hit them over HTTP with a
  signed session).
- That the empty state actually looks right against the test account (which, per the
  progress ledger, genuinely has zero opportunities in every pipeline right now) — this is
  the state Jake will actually see first and I could not screenshot it.
- The Sales spine icon's new destination, `/admin/setter`, has not been clicked through
  live.
- Visual QA against the approved mockup (`setter-suite-mockups.html`, direction 1 "Classic
  Board") was done by re-reading its CSS/markup and mirroring the same tokens, spacing, and
  structure, not by rendering both side by side.

Jake (or whoever next has a live admin session) should click through `/admin/setter` in
both themes before trusting this is pixel-right.

## Fix pass 1

Addressed three review findings. Files touched, all in scope: `src/lib/setterModel.ts`,
`src/lib/setterModel.test.ts`, `src/components/admin/setter/SetterCard.tsx`.
`SetterBoard.tsx` needed no change.

### Finding 1 (Important): stale state was color-only

The "stale" rail (warning tone, a needs-dialing lead uncontacted past 24h) had no text or
icon, unlike "never dialed" (danger tone), which also carries a "Never dialed" chip. Fixed
by adding a chip using the exact same vocabulary/markup as the existing chips (`rounded-full`,
`bg-{tone}-tint`, `text-{tone}`, `text-[9.5px] font-bold uppercase tracking-wide`), reusing
the warning tokens the rail itself already uses (`--warning`/`--warning-tint`, defined for
both themes in `src/index.css`).

The chip states the actual fact rather than just "Stale": a new pure helper,
`staleWaitingLabel(createdAt, now)` in `setterModel.ts`, renders "Waiting {N}h" under a day
and "Waiting {N}d" at a day or more (same hour/day bucketing `timeAgo.ts` uses, phrased for
the chip's vocabulary instead of a relative-timestamp caption). It falls back to the bare
word "Waiting" on an unparseable date rather than throwing or showing "NaNh".

`SetterCard.tsx` renders this chip whenever `rail === "warning"`, right after the
attempts/never-dialed chip. Since `isStaleUncontacted` requires `!lead.contacted`, the new
chip and the existing "Spoke" chip can never both render on the same card. The rail's inset
color bar is untouched, so the state is now both color and text, not text replacing color.

Priority was already correct and untouched: `cardRail()` (in `setterModel.ts`, not modified
by this pass) still returns `"danger"` before checking `"warning"`, so a lead with zero
attempts always shows the danger rail + "Never dialed" chip even if it is also stale. This
is covered by the existing test `"danger outranks warning when both conditions hold"`, which
still passes unmodified.

TDD followed for the new pure logic: wrote the `staleWaitingLabel` describe block first
(three cases: hours, days, unparseable date), ran it, watched all three fail with
"staleWaitingLabel is not a function", then implemented. One test's fixture data was wrong
on the first pass (26h fell into the day bucket by design, same as `timeAgo`), fixed the
test to 20h and reran green.

### Finding 2 (Minor): duplicated `needsDialing`, one copy dead

Deleted the client-side `needsDialing()` export and its describe block from
`setterModel.test.ts`, rather than finding a use for it.

Reasoning: grepped the whole `src/` tree and it had exactly one caller, its own test.
`SetterBoard.tsx` already receives `stage.needsDialing` as a boolean straight off the wire
(`ApiSetterPipeline.stages[].needsDialing` in `api.ts`), computed once, server-side, in
`functions/api/admin/setter/pipelines.ts` (`shapeSetterPipeline`) against the live stage
name, with an identical regex. There is no place in the client where recomputing the flag
from a stage name would be correct instead of just trusting the field the server already
sent: the server is the one that actually resolves live pipeline data, so it is already the
authoritative source, and the client only ever holds the resolved boolean, never a bare
stage name it would need to re-derive it from. Keeping the client copy "just in case" is
exactly the kind of drift risk the finding describes, so it goes. Left a comment in
`setterModel.ts` at the deletion site pointing at the server file, so nobody re-adds it
without reading why it isn't there.

### Finding 3 (Minor): focus styling inconsistency

Added `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40` to the
card `<button>` in `SetterCard.tsx`, matching `RecurringRow`/`PlainRow` in
`src/routes/Customers.tsx` exactly (same ring width, same brand/40 tone).

### Commands run

```
cd command-center/app
npx vitest run src/lib/setterModel.test.ts   # 3 new tests failed (function missing) before implementation
npx vitest run src/lib/setterModel.test.ts   # 1 of 3 new tests failed on bad fixture data (26h → day bucket by design)
npx vitest run src/lib/setterModel.test.ts   # 12 passed after fixing the fixture
npm test -- --run                             # 937 tests passed, 88 files
npm run typecheck                             # clean, no output
npm run build                                 # tsc + vite build succeeded
```

### Full `npm test -- --run` tail

```
 Test Files  88 passed (88)
      Tests  937 passed (937)
 Duration  4.14s (transform 4.30s, setup 0ms, collect 12.92s, tests 1.10s, environment 25ms, prepare 16.90s)
```

### `npm run typecheck` output

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```
(no output = clean)

### `npm run build` output (tail)

```
✓ 2254 modules transformed.
dist/assets/index-BnF8-Bth.css   105.45 kB │ gzip:  18.41 kB
dist/assets/index-D4vQ11Ae.js  1,512.54 kB │ gzip: 395.57 kB
✓ built in 4.77s
PWA v1.3.0 ... files generated, dist/sw.js
```

Did not re-verify with a live admin session (same limitation as the original pass: minting
an admin session is classifier-blocked in this environment). The new chip and focus ring are
reviewed by markup/token match against sibling components, not screenshotted.

## Concerns to flag before Task 8

- Tenant/pipeline selection lives in component-local `useState` with no URL param. If Task
  8's cockpit wants a shareable/bookmarkable URL per client (`/admin/setter/:tenantId`),
  that's a routing change, not just an addition — flag it early rather than bolting it on.
- The "source chip" gap (item 1 above): if a future backend change adds a light source
  field to `ApiSetterLead` (e.g. a single non-N+1 derived tag), `SetterCard` has a clear
  slot to add it back in.
