# 04 — One-click Phase 1 cascade

> **Status:** Proposed. Build fourth.
> **Effort:** 1 day.
> **Why this matters:** Signing a client today triggers 6 separate form runs. Each is fast individually; the friction is the decision count. Bundle them.

---

## Why this matters

The onboarding plan (`onboardingPlan.ts`) defines 6 phases. Phase 1 ("Close the Deal") alone has the welcome email, contract, expectations email, kickoff invite, intake form share, and Profile.md creation. Every new client = 6 deliberate form opens within 24 hours of signing.

When you sign one client a month this is fine. When you sign one a week — and especially when a single great outreach campaign produces three signings in one day — you start to skip steps. The cascade removes the decision count.

## What we have today

- 17 forms in `formConfigs.ts`. Phase 1 forms: `welcome-email`, `contract`, `expectations-email`, plus the new-client profile form (already exists in Settings flow).
- `OnboardingChecklist.tsx` — tracks per-task completion.
- `Profile.md` per client + `prefillFromProfile` already wires shared fields between forms.

## What "done" looks like

1. **"Mark client Won" button** on Client Hub. Already partially exists via `OpsClientRow`. Confirm it fires the cascade hook.
2. **One modal opens** with the Phase 1 checklist + per-form draft preview:
   - ☑ Welcome email — draft generated, shown in modal.
   - ☑ Expectations email — draft.
   - ☑ Contract — draft.
   - ☑ Kickoff calendar invite — pre-filled (link to onboarding calendar from `Profile.md`).
   - ☑ Intake form share — link copied.
3. **Approve each (or batch approve all).** Jake reviews drafts in-place. One click per item or "Approve all" at the bottom.
4. **Sends + saves fire in parallel.** Drafts go to Gmail (or Instantly if email-sender is wired from doc 03). Files save to `vault/Clients/<name>/onboarding/`.
5. **Activity log line per action.** `phase1_welcome_sent`, `phase1_contract_sent`, etc.
6. **Onboarding checklist auto-ticks** those tasks done with timestamps.

Total time from "Won" click to all sent: ~3 minutes of review, vs. ~45 minutes of context switching today.

## Build steps

1. **Cascade definition.**
   - New `app/src/lib/cascades.ts` — declarative spec: `PHASE_1_CASCADE = [{ formId: 'welcome-email', autofillFrom: 'profile' }, { formId: 'contract', ... }, ...]`.
   - One place to add/remove steps without code changes elsewhere.

2. **Bulk runner.**
   - For each step in the cascade: load the form config, build values from `prefillFromProfile`, render the prompt via `assembleGenericPrompt`, run `claude -p` in parallel via `Promise.all`.
   - Stream all 5–6 results into a single modal as they complete.

3. **The modal.**
   - New `app/src/components/Phase1CascadeModal.tsx`.
   - Each step is a collapsible card: status (pending → generating → ready → approved → sent), preview of the output, edit button (opens the underlying form for tweaks), approve checkbox.
   - Footer: "Approve all 6" big button + per-step state count.

4. **Send actions.**
   - Wire to existing send paths (Gmail draft today, full send if doc 03 has shipped).
   - Calendar invite: Google Calendar API via existing OAuth in `google_oauth_secrets.rs`.

5. **Onboarding checklist auto-tick.**
   - On send-success per step, call existing `markOnboardingTaskComplete(client_slug, task_id)`.
   - Stamp with timestamp + "auto-cascade" flag so the audit trail is honest.

6. **Failure recovery.**
   - If one step fails (LLM error, send failure), the rest still proceed. Failed step stays in the modal until manually retried.
   - "Skip this step" option for any item Jake intentionally wants to do later.

## Open decisions

- **Should the cascade run automatically on "Won" click, or only when Jake confirms?** Recommend: cascade opens but does NOT auto-send. Jake reviews every draft before send. Confirm.
- **What lives in Phase 2–6 cascades later?** Out of scope here; this doc is Phase 1 only. But the abstraction in step 1 should be reusable.
- **Contract generation.** Currently the contract form produces markdown. Does Jake want DocuSign/PandaDoc integration, or is "send the markdown as a PDF + countersign manually" acceptable for v1? Recommend the latter.

## Out of scope

- Phase 2–6 cascades (Phase 2 = Onboarding Call deliverables, Phase 3 = Technical Setup, etc.). Build the abstraction here; expand later.
- Auto-sending without Jake review. Always human-in-the-loop.
- Contract e-signing integrations. Manual countersign for v1.

## Effort + leverage

- 1 day.
- Per-new-client savings: ~40 minutes.
- At 1 new client/week: 35 hrs/year. At 2/week: 70 hrs/year. Lubricates every other scaling lever.
