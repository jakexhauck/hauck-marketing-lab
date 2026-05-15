# Client Onboarding Sequence — guided wizard for new-client forms

> **Status:** Proposed. Foundation/adjacent — not on the numbered priority list, but a natural successor to [04-one-click-phase-1-cascade.md](04-one-click-phase-1-cascade.md).
> **Effort:** 2–3 days.
> **Why this matters:** New clients today require Jake to know which form to open next, in what order, with which prior outputs in hand. The OnboardingChecklist tracks *that* a thing happened; it doesn't *guide* the next form. Mirror the OutreachSequencePage model — a stepper that walks the new client from signed → launched, with each form's output auto-feeding the next.

---

## What we have today

- **`OutreachSequencePage`** — proven stepper pattern: scrape → mockup → DM → summary, shared state, resumable on reopen.
- **`OnboardingChecklist`** — per-client phased checklist (Phase 1: Onboarding Call → 2: Tech → 3: Creative → 4: Launch...). Tracks completion, syncs phase completion to GHL pipeline. Does not run forms.
- **Forms** — `app/src/lib/formConfigs.ts` declares every form. Forms in scope for the sequence (mocked at `mockups/forms/`):
  - `onboarding-calendar` — schedule the kickoff call
  - `audience-builder` (`audience-research` in formConfigs) — competitor + audience research
  - `ad-copy-generator` (`ad-copy`) — 10+ variations
  - `web-designer` — landing page mockup
  - `pre-launch-qa` — pixel/payment/approval gate
- **`prefillFromProfile`** already wires Profile.md fields into forms — proves the auto-prefill plumbing works for one source. The sequence extends this to chain step N → N+1.
- **Client Hub** has tab pages (`Overview`, `Campaigns`, `Resources`, etc. under `app/src/components/MainDashboard/pages/`).

## What "done" looks like

1. **New "Sequence" tab on Client Hub.** Visible while the client is in the onboarding phase. Hidden after Jake clicks "Mark launched."
2. **5-step stepper** (one per form), top-of-page like OutreachSequencePage:
   1. Onboarding Calendar — confirm call booked
   2. Audience Builder — competitors + audience saved
   3. Ad Copy Generator — 10+ variations approved
   4. Web Designer — landing page generated
   5. Pre-launch QA — pixel + payment + client approval
3. **Each step auto-prefills from prior outputs.** Audience output → ad-copy `audience` field. Ad-copy output → web-designer `headlines` field. Etc. User can edit anything before submitting.
4. **State persists per-client** in `vault/Clients/<name>/onboarding.json` (existing file). New `sequence` block: `{ currentStep, stepOutputs: { stepId: { path, completedAt } } }`.
5. **"Mark launched" button** at the bottom of step 5. Sets `adsLaunchedAt` on the client + flips a `sequenceComplete: true` flag. The Sequence tab disappears; standalone form access (existing UI) is the only entry point thereafter.
6. **Onboarding checklist auto-ticks** the matching task when each step completes (same pattern as 04-cascade). Activity log line per step.
7. **Resumable.** Closing the tab and reopening lands on `currentStep`. Completed steps show a green checkmark + "View output" link to the saved file in `vault/Clients/<name>/onboarding/`.

## Build steps

1. **Sequence definition.**
   - New `app/src/lib/onboardingSequence.ts` — declarative spec mirroring `cascades.ts` style:
     ```ts
     export const ONBOARDING_SEQUENCE: SequenceStep[] = [
       { id: "calendar",  formId: "onboarding-calendar", checklistTaskId: "02-call",      chainFrom: null },
       { id: "audience",  formId: "audience-research",   checklistTaskId: "04-audiences", chainFrom: null },
       { id: "ad-copy",   formId: "ad-copy",             checklistTaskId: "04-copy",      chainFrom: { step: "audience", fields: { audience_summary: "audience" } } },
       { id: "website",   formId: "web-designer",        checklistTaskId: "04-creative",  chainFrom: { step: "ad-copy",  fields: { primary_headline: "hook" } } },
       { id: "qa",        formId: "pre-launch-qa",       checklistTaskId: "05-qa",        chainFrom: null },
     ];
     ```
   - Field-mapping is the only spec that needs maintenance when forms evolve.

2. **Sequence state on disk.**
   - Extend `vault/Clients/<name>/onboarding.json` with a `sequence` key. No migration needed — absent key = step 1, no outputs.
   - New helpers in `app/src/lib/clientProfile.ts` (or sibling): `loadSequenceState(slug)`, `saveSequenceState(slug, state)`.

3. **Output → input bridge.**
   - When step N completes, parse the form output (markdown table for ad-copy, structured JSON for audience) and persist to `sequence.stepOutputs[stepId]`.
   - When step N+1 opens, read `chainFrom`, pull the named field from the prior step's output, prefill into the next form's values *before* `prefillFromProfile` runs (so Profile.md is the fallback, not the override).

4. **The Sequence tab UI.**
   - New `app/src/components/MainDashboard/pages/ClientSequence.tsx`.
   - Top: stepper showing 1–5 with status badges (done / current / pending / skipped).
   - Body: the form for the current step, rendered via existing `GenericFormGenerator` with prefilled values.
   - Footer: "Save & continue" (advances `currentStep`), "Skip step" (marks skipped, advances), "Back" (no destructive consequences — re-opens the prior step's form pre-filled with its saved output).
   - Step 5 footer adds the prominent "Mark launched" button — disabled until step 5 has produced an output.

5. **Client Hub tab visibility.**
   - In the Client Hub tab list, conditionally render the Sequence tab when `!sequenceComplete`. After launch, tab disappears; users access forms via existing menu.
   - Default landing tab for a new client = Sequence (until launched), then Overview.

6. **"Mark launched" wiring.**
   - Sets `adsLaunchedAt = now` (existing field — see `project_onboarding_autopopulate.md` memory).
   - Sets `sequenceComplete = true` in onboarding.json.
   - Fires the same checklist auto-tick + activity-log line as a normal step completion.

7. **Failure / partial recovery.**
   - If a `claude -p` call fails mid-step, the form stays open with its current values; nothing is persisted. Same UX as standalone form runs.
   - If chaining fails (prior step's output is malformed), prefill silently skips that field and logs a console warning. Never block the user on auto-prefill.

## Open decisions

- **Activity log integration.** The [activity-log-and-memory-writeback.md](activity-log-and-memory-writeback.md) substrate isn't shipped yet. Recommend: write to `vault/Clients/<name>/activity.log` with the same line format anticipated by that doc, so this build is forward-compatible without blocking on it.
- **What if Jake re-runs a completed step?** Recommend: re-running overwrites the saved output and invalidates downstream prefills (next step gets a banner: "Audience was re-generated — review the prefilled values before submitting."). Don't auto-rerun downstream forms.
- **Skip semantics.** Skipped steps don't block "Mark launched." They show as a yellow badge in the stepper. Confirm.
- **Mobile/narrow-screen layout.** Out of scope for v1 — Sequence tab assumes desktop, like OutreachSequencePage.

## Out of scope

- **Intake form in the sequence.** Intake runs before the client exists in the vault (it's the form that *creates* the client). Sequence starts at the calendar step. See `project_client_intake_form.md` memory.
- **Post-launch sequences.** Weekly/monthly reports stay standalone forms — they're not a one-time onboarding artifact.
- **Cross-client batch sequencing.** One client at a time. Multi-client cascade is doc 04's territory.
- **Re-opening sequence after launch.** Once `sequenceComplete = true`, the tab is gone. Editing happens via standalone form access. Avoids ambiguity about "is this client onboarding or launched?"

## Effort + leverage

- 2–3 days. Most of the work is the chaining bridge (step 3) and the field-mapping spec (step 1). The UI is a slim wrapper around `GenericFormGenerator`.
- Per-new-client savings: ~30 minutes (no decision count, no copy-pasting outputs between forms).
- Compounds with [04-one-click-phase-1-cascade.md](04-one-click-phase-1-cascade.md): cascade handles the *parallel* Day-0 deliverables (welcome email, contract, calendar invite); this sequence handles the *serial* Day-0-through-launch deliverables (audience → copy → site → QA). Together they cover the full new-client arc.
