# Task 8 report: the cockpit

## Summary

Built the Setter Suite cockpit: a panel docked to the right of the board (Task 7) showing the
selected lead, where the setter logs a dial, applies tags, and books an estimate. Wired into
`SetterSuite.tsx` at the seam Task 7 left (`selectedLead` state + `onSelectLead`).

## Files created

- `command-center/app/src/lib/setterCockpit.ts` - pure logic: the five outcomes and their API
  values, `defaultSpokeForOutcome`, `isContradictoryDial`, the optimistic dial builder/reducer
  (`buildOptimisticDial`, `prependOptimisticDial`, `bumpLeadForDial`, `isOptimisticDial`), and
  slot/day/end-time formatting for the booking grid.
- `command-center/app/src/lib/setterCockpit.test.ts` - 19 tests for all of the above.
- `command-center/app/src/components/admin/setter/SetterCockpit.tsx` - the docked panel shell:
  identity header (click-to-call, mailto), sticky within the page's own scroll container with
  its own internal scroll region, sections in order Log this call / Tags / Book an estimate /
  Call history.
- `command-center/app/src/components/admin/setter/DialLogger.tsx` - the five outcome buttons
  (Booked, Not interested, No answer, Reschedule, Bad lead), the spoke override toggle
  (defaults per outcome, overridable), an optional note, and the submit that calls
  `useLogSetterDial`. Blocks submit client-side on the no_answer+spoke:true contradiction and
  shows a specific message if the API still rejects it as `contradictory`.
- `command-center/app/src/components/admin/setter/TagField.tsx` - current tags as removable
  chips, a free-text add input, a "Used before" suggestion row sourced from this contact's own
  `dials[].tagsApplied` history (there is no location-wide tag list endpoint, see Deviations),
  and the required one-line warning that tagging fires the client's automations.
- `command-center/app/src/components/admin/setter/SlotPicker.tsx` - calendar name + duration
  inputs, a live day selector, a slot grid for the selected day, and a Book button. Renders the
  `needs_staff` case with the exact copy from the brief. Never retries the booking POST; the
  button disables the instant the mutation is in flight.

## Files modified

- `command-center/app/src/lib/api.ts` - added `ApiSetterDial` and `ApiSetterLeadDetail` wire
  types, mirroring `functions/api/admin/setter/lead/[contactId].ts` and
  `functions/api/admin/setter/dials.ts:shapeDialRow` exactly.
- `command-center/app/src/hooks/useApi.ts` - added `useSetterLeadDetailQuery`,
  `useLogSetterDial` (optimistic, with rollback via full snapshot restore, matching the existing
  `useMarkJobPaid` pattern in this file), `useSetterTagsMutation`, `useSetterSlotsQuery`,
  `useSetterBookMutation` (`retry: false`, explicit even though it matches the global mutation
  default, since it is a hard requirement not an incidental one).
- `command-center/app/src/routes/admin/SetterSuite.tsx` - wraps the board in a flex row with the
  new cockpit, added `closeCockpit`, passes `tenantId`/`pipelineId`/`pipelineName`/`lead` down.
  This file was in Task 7's scope but had to be touched here since it owns the only render seam
  the cockpit plugs into.

## Commands run

```
npx vitest run src/lib/setterCockpit.test.ts   # before implementation: 1 failed suite (module missing)
npx vitest run src/lib/setterCockpit.test.ts   # after: 19 passed
npm test                                        # 88 files, 936 passed (was 917 before this task)
npm run typecheck                               # tsc --noEmit (app) + tsc --noEmit -p functions/tsconfig.json: clean
npm run build                                   # tsc && vite build: clean, dist/ produced
```

## Full test output (npm test, tail)

```
 Test Files  88 passed (88)
      Tests  936 passed (936)
```

## Full typecheck output

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```
(no output, exit 0)

## Full build output (tail)

```
> client-dashboard@0.1.0 build
> tsc && vite build

vite v7.3.6 building client environment for production...
transforming...
2254 modules transformed.
dist/registerSW.js              0.13 kB
dist/manifest.webmanifest       0.44 kB
dist/index.html                 1.47 kB | gzip:   0.64 kB
dist/assets/index-BnF8-Bth.css  105.45 kB | gzip:  18.41 kB
dist/assets/index-BRfS0Cgt.js   1,512.10 kB | gzip: 395.46 kB
(chunk-size warning, pre-existing, not introduced by this task)
built in 4.62s

PWA v1.3.0
Building src/sw.ts service worker
88 modules transformed.
dist/sw.mjs  26.14 kB | gzip: 8.56 kB
built in 148ms
precache  19 entries (2661.36 KiB)
files generated
```

## How the five requirements-that-matter-more-than-they-look were handled

1. **Exact five outcomes.** `OUTCOMES` in `setterCockpit.ts` is the single source of truth
   (value + label), consumed by `DialLogger`. Tested verbatim in `setterCockpit.test.ts`.

2. **no_answer + spoke:true guard.** `defaultSpokeForOutcome` sets the toggle the instant an
   outcome is picked. `isContradictoryDial` (same predicate as the server's
   `validateDialBody`) disables the submit button and shows inline red text if the setter
   overrides into the bad combination. If the API still returns `contradictory` (e.g. a stale
   client), `DialLogger`'s mutate-level `onError` reads `err.body.error` and shows a specific
   toast rather than a generic failure message.

3. **Tag warning copy.** `TagField` always renders: "Adding or removing a tag fires this
   client's automations immediately, only tag what you mean to trigger." No GHL/GoHighLevel
   naming anywhere in UI copy.

4. **Optimistic dial + rollback.** `useLogSetterDial`'s `onMutate` builds a temp-id dial
   (`buildOptimisticDial`), prepends it to the cached lead-detail dial list
   (`prependOptimisticDial`) and bumps the matching board card in the cached leads list
   (`bumpLeadForDial`, mirroring `functions/lib/setterMetrics.ts:rollUpByContact`'s rules:
   attempts+1, contacted only ever turns on, lastOutcome becomes the new dial's outcome). On
   error both caches are restored to their exact pre-mutate snapshot (same pattern as the
   existing `useMarkJobPaid` hook), so a failed write can never leave a phantom dial or an
   inflated attempt count. `onSettled` invalidates both queries to reconcile with the server.

5. **Booking not retryable.** `useSetterBookMutation` sets `retry: false` explicitly (the
   project's mutation default is already 0, kept explicit as a hard requirement). `SlotPicker`
   disables the Book button via `bookMutation.isPending` the instant it fires, so a double-click
   cannot queue a second POST.

6. **needs_staff rendered distinctly.** `SlotPicker` checks `err.body.error === "needs_staff"`
   from the slots query and renders the brief's exact copy: "This calendar has no team members
   assigned, so it cannot return availability." A separate `calendar_not_found` branch and a
   generic-error branch are also distinct, never collapsed into an empty grid.

## Deviations from the literal brief text

- **TagField's "location's live tag list."** No backend endpoint returns a location-wide tag
  catalog (only `functions/api/admin/setter/tags.ts`, which returns one contact's current tags
  after a write, was in scope). Rather than invent a new endpoint (backend is marked DONE) or
  fabricate a static tag list, the suggestion row is sourced from real, live data already on the
  lead detail response: the union of `tagsApplied` recorded on this same contact's past dials,
  labeled "Used before." Flagging this since it is a legitimate reading of unavailable data, not
  a literal match to "location's tag list."
- **Calendar name and duration are editable inputs**, not a hardcoded constant. The client-facing
  booking flow (`CallConsole.tsx`) hardcodes `"Home Estimate"` because it only ever books one
  named calendar for one client. The Setter Suite works every pipeline for any client via a
  tenant dropdown, and `slots.ts`/`book.ts` are both generic on `calendarName` with no per-client
  config field for it, so the cockpit exposes it as a field (defaulted to `"Home Estimate"`,
  60 minutes) rather than guessing a fixed value that would be wrong for other clients/calendars.
- **"Notes" as a distinct final section.** The brief's section order lists "...history, notes."
  There is no generic contact-notes endpoint in the admin/setter backend contract (only the dial
  row's own optional `note` column). Reusing the client-facing `NoteList` component would have
  hit the wrong tenant's credentials, since it resolves tenant from the client session cookie,
  not from an admin `tenantId` param. The dial's note field is therefore captured as part of
  "Log this call" (DialLogger) and displayed per-entry in "Call history," rather than adding an
  unsupported general notes feature.

## What could not be verified

Nobody can drive this through a real admin session in this environment (no live admin login, no
Doppler-backed CRM credentials here). Not eyeballed:
- The docked layout's sticky/independent-scroll behavior in a real browser at various viewport
  heights (verified only by reading the CSS classes against the `LeadDetailDesktop.tsx` /
  `RightRail.tsx` precedents already shipped in this codebase; no Playwright run was possible
  without a live session).
- Light/dark theme rendering (token classes only, e.g. `bg-surface-2`, `text-brand-text`,
  `border-warning`; not screenshotted).
- The actual optimistic-to-real reconciliation against a live GHL contact (unit-tested the pure
  reducers; the mutation wiring itself is exercised only by TypeScript, not a live network call).
- Whether `"Home Estimate"` is in fact the right default calendar name for clients other than
  Willis; it is editable, so this only affects the pre-filled value.

## Verification

`npm test`, `npm run typecheck`, and `npm run build` all pass, run from
`command-center/app` in this worktree. Full output above.

## Fix pass 1

Two Important review findings fixed. No pure-logic changes were needed, so `setterCockpit.ts`
and its test are untouched (only the two component files changed).

### Finding 1: spoke override was keyboard-unreachable

`DialLogger.tsx`'s spoke toggle was a `<span role="switch" onClick={...}>` with no `tabIndex`
and no `onKeyDown`: decorated to look like a control but impossible to focus or activate from a
keyboard. Since this toggle is the only way to correct the outcome buttons' auto-set default
before the backend's `no_answer` + `spoke:true` rejection, a keyboard user could get stuck unable
to log a true no-answer call as anything else.

**Reused `src/components/ui/Switch.tsx` as-is**, no changes needed to that file. It is already a
real `<button role="switch">` with `aria-checked`, `focus-visible:ring-2 focus-visible:ring-brand/40`,
and a disabled state, matching exactly what the finding asked for. `DialLogger.tsx` now imports it
and renders `<Switch checked={spoke} onChange={setSpoke} label="Spoke with them" />` in place of
the hand-rolled span pair. Followed the same call pattern already used at
`SettingsControls.tsx:292` (`ChannelsControl`): visible label text as a sibling `<span>`, plus the
`label` prop as the switch's own `aria-label`, both inside a plain `<div>` row (dropped the
enclosing `<label>` since `Switch`'s own accessible name via the `label` prop makes it redundant
and the button-in-label nesting pattern that existed before added nothing `Switch` doesn't already
provide).

One visible side effect: `Switch` renders its "on" fill as `bg-brand` (with the brand gradient),
not the bespoke `bg-positive` green the hand-rolled span used. The `Phone`/`PhoneOff` icon beside
the label still switches `text-positive`/`text-faint` on state change, so the on/off distinction
is still colour-coded, just via the icon rather than the track. Flagging this as an intentional
consequence of reusing the shared component rather than a bug.

### Finding 2: failed detail fetch was indistinguishable from empty tags/history

`SetterCockpit.tsx` only branched on `detailQuery.isLoading`, never `detailQuery.isError`. A
failed `/api/admin/setter/lead/:contactId` fetch left `tags` and `dials` as their `?? []`
fallbacks, so the panel rendered "No tags on this contact yet." and "No dials logged yet." on a
request that never landed, exactly as if the contact truly had no history. A setter reading that
could start dialling a contact who has actually been called before.

Added a `detailQuery.isError` branch to both sections in `SetterCockpit.tsx`:
- **Tags section**: when `detailQuery.isError`, renders `DetailLoadError` instead of `TagField`
  (left `TagField.tsx` itself untouched, out of scope; the branch lives in the parent since tags
  is an all-or-nothing prop today).
- **Call history section**: added `detailQuery.isError` as a branch between the existing
  `isLoading` and the `dials.length === 0` empty check, so error, loading, and true-empty are
  three distinct renders, matching `SlotPicker.tsx`'s standard of never collapsing a failed fetch
  into an empty grid.

New local component `DetailLoadError` (defined once in `SetterCockpit.tsx`, used by both
sections) follows the same convention as `ActivityDesktop.tsx`'s `FeedError`: a danger-tinted
panel (`border-danger/30 bg-danger-tint`) with a `TriangleAlert` icon, states what failed
("Could not load tags." / "Could not load call history."), and a `Button variant="secondary"
size="sm"` labeled "Retry" that calls `detailQuery.refetch()`. A retry affordance was appropriate
per the brief since this is a plain GET (no mutation/booking logic touched). Sized down from
`FeedError`'s full-width layout to fit this panel's narrower docked columns, and reduced text
size to `text-[12.5px]` to match the rest of the cockpit's compact type scale.

No em dashes, no GoHighLevel/GHL naming, only design tokens (`border-danger/30`, `bg-danger-tint`,
`text-danger`), both themes covered since every class used is an existing token already proven in
light/dark elsewhere in this app.

### Commands run

```
npm test          # from command-center/app
npm run typecheck # from command-center/app
npm run build     # from command-center/app
```

### Full test output (tail)

```
 Test Files  88 passed (88)
      Tests  937 passed (937)
   Start at  16:46:19
   Duration  3.81s (transform 3.50s, setup 0ms, collect 11.07s, tests 1.02s, environment 23ms, prepare 15.99s)
```

### Full typecheck output

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```
(no output, exit 0)

### Full build output (tail)

```
> client-dashboard@0.1.0 build
> tsc && vite build

vite v7.3.6 building client environment for production...
transforming...
2254 modules transformed.
dist/registerSW.js              0.13 kB
dist/manifest.webmanifest       0.44 kB
dist/index.html                 1.47 kB | gzip:   0.64 kB
dist/assets/index-BnF8-Bth.css  105.45 kB | gzip:  18.41 kB
dist/assets/index-Clf7hAxU.js   1,512.82 kB | gzip: 395.61 kB
(chunk-size warning, pre-existing, not introduced by this fix pass)
built in 5.03s

PWA v1.3.0
Building src/sw.ts service worker ("es" format)...
88 modules transformed.
dist/sw.mjs  26.14 kB | gzip: 8.56 kB
built in 156ms
precache  19 entries (2662.06 KiB)
files generated
dist/sw.js
```

### Files changed this pass

- `command-center/app/src/components/admin/setter/DialLogger.tsx`
- `command-center/app/src/components/admin/setter/SetterCockpit.tsx`
