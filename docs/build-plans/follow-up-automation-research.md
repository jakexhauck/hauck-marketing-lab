> ## Run this build (read first)
>
> You are a Claude instance executing this plan autonomously.
>
> 1. `git pull origin main`, then create a **git worktree** for this build (invoke the `using-git-worktrees` skill).
> 2. Read this whole doc, especially the **Isolation contract** at the bottom.
> 3. **This is a RESEARCH spike.** Run the probes (read-only, via the `ghl` CLI in `gohighlevel-cli/`), then write your findings and the chosen wiring option into THIS doc and STOP. Do not edit app code, and do not build unless the decision gate in this doc says the real data exists.
> 4. If (and only if) the gate says build: you will touch `src/lib/leadsHub.ts` and the Leads components, which the action-wiring build also edits, so do the build phase AFTER action-wiring has merged to main. Any demo change goes in `src/demo/handlers/followups.ts`, never in `src/demo/handler.ts`. Never use em dashes anywhere.
> 5. Report your findings, the recommended option, and whether it is worth building.

# Follow-up automation: real-data research spike + plan

Status: RESEARCH ONLY. No app code changes. Output of the spike decides which of two
wiring options we build in a later plan.

Package: `command-center/app` (the one responsive app). Client: Willis, GHL location
`OznT3yyuwK3dqVXDsCaD`. Tooling: `ghl` CLI at `gohighlevel-cli/` (run via `ghl.ps1`,
`PYTHONUTF8=1`). PIT is Willis-scoped; the Firebase token is agency-wide for the internal API.

## 1. Goal + Definition of Done

**Goal of the spike:** determine, per contact, whether GHL's API can tell us
(a) which nurture workflow the contact is enrolled in, (b) which step of that workflow
they are on, and (c) whether and where they replied. Then decide how to feed the
Leads and Estimate-Forms follow-up tracker from real data instead of the demo `fu` field.

**Definition of Done for THIS doc:** a written spike list run against live Willis GHL,
a recorded yes/no on "does the public API expose step history," and a picked wiring
option (full step-history vs inferred fallback) with the exact endpoints it will use.

**Definition of Done for the follow-on BUILD (out of scope here):** a real session
renders the tracker (`FuDots` / `FuTrack` / `FuChip` / `automationNote`) from live GHL
state for Paid Ads and Estimate-Forms leads, demo sessions unchanged, and `SEQ.ad` /
`SEQ.form` step definitions match the real live workflows.

## 2. The demo `fu` shape any real source must map to

The UI is the contract. Whatever we source from GHL must reduce to this. Defined in
`command-center/app/src/lib/leadsHub.ts`, consumed by `src/routes/sales/LeadsHub.tsx`
(`FuDots`, `FuChip`, `FuTrack`) and by `automationNote()` in `leadsHub.ts`.

```ts
// per-lead follow-up state
interface FollowUp {
  sent: number;        // how many sequence steps have gone out (1-based count)
  respondedAt: number; // 1-based step index the lead replied at; 0 = no reply yet
  outcome: FollowUpOutcome;
}
type FollowUpOutcome = "replied" | "awaiting" | "noresponse" | "booked" | "won";

// static per-source step catalogue the dots/track render against (PLACEHOLDER today)
const SEQ: Record<"ad" | "form", FollowUpStep[]>;
interface FollowUpStep { channel: "sms" | "email" | "call"; label: string; delay: string; }
```

Two independent things:
- **`SEQ`** = the ladder of steps and their order/channel. Static, per source. Must be
  made to match the real live workflow (confirm step count, channels, timing).
- **`fu`** = where THIS lead is on that ladder (`sent`), where they replied
  (`respondedAt`), and the terminal chip (`outcome`).

How each field drives the UI (so we know the minimum we must derive):
- `sent` -> how many dots/nodes render filled ("done").
- `respondedAt` -> which node gets the green "replied" ring; drives the "reply pauses
  the sequence" story.
- `outcome` -> the colored chip (Replied / Awaiting reply / No response / Call booked / Won)
  and the `automationNote()` sentence.

Current live mapping stub: `mapApiSalesLead()` in `leadsHub.ts` deliberately omits `fu`,
so real sessions currently render no tracker. That is the gap this fills. Note also that
`GET /api/sales/leads` (`functions/lib/ghl.ts`, `shapeOpportunity`) does NOT carry any
follow-up state today; it is opportunity + contact join only.

## 3. Prioritized SPIKE list (run against live Willis, record results inline)

Run in order. Stop early if a higher-priority probe already returns step history.
Public API base `https://services.leadconnectorhq.com`. The `ghl` CLI covers most of
these; raw `curl` where the CLI has no subcommand.

**P0, What workflows even exist (baseline for `SEQ`).**
- `ghl --json workflows list` (CLI wraps `GET /workflows/?locationId=...`).
- Record: the nurture workflow name(s) for Paid Ads SMS and Estimate-Forms email+SMS,
  their ids, and each one's ordered steps/channels/delays. This is what `SEQ` must match.
- Risk: `/workflows/` may return workflow metadata WITHOUT the internal step list. If the
  public list has no steps, step definitions come from the internal API or by reading the
  builder in GHL by hand.

**P1, Does a contact expose its active workflows/campaigns? (field (a))**
- `ghl --json contacts get --contact-id <id>` (`GET /contacts/{id}`). Inspect the payload
  for any `workflows`, `campaigns`, `activeWorkflows`, or enrolment array.
- Also probe undocumented sub-resources by raw call:
  - `GET /contacts/{id}/workflow` and `/contacts/{id}/workflows`
  - `GET /contacts/{id}/campaigns`
- Record: does anything list which workflow the contact is currently IN. (The public
  workflow API the CLI exposes is list / enroll / remove only. There is no documented
  "read a contact's enrolments," so expect this to come back empty and force P3/P4.)

**P2, Step / status within a workflow (field (b)).**
- Probe for any per-enrolment status: `GET /workflows/{workflowId}` (does it return the
  contact's position?), and any `.../executions`, `.../history`, `.../status` variants.
- Record: is there ANY per-contact "current step" value in the public API. Expected: no.

**P3, Message thread as a reply + last-outbound proxy (field (c), and a `sent` proxy).**
- `ghl --json conversations messages ...` and the app's existing
  `GET /api/conversations/:contactId/messages`.
- Count outbound automated messages (a `sent` proxy) and find the first inbound message
  timestamp (a `respondedAt` / "replied" proxy). Confirm whether messages flag automation
  vs human send (an `auto` marker) so we do not count a rep's manual text as a nurture step.

**P4, Pipeline stage as the outcome + reply signal (field (c) fallback).**
- `ghl --json opportunities get --opportunity-id <id>` and the live stage names from
  `wire-sales-endpoints.md` (Paid Ad's Pipeline stages: Lead In -> Lead Responded ->
  ... -> Estimate Scheduled). "Lead Responded" / "Estimate Scheduled" stages already
  encode replied / booked. Map stage -> `outcome`.

**P5, Internal / Firebase API (last resort for true step history).**
- Using the agency Firebase token (see `gohighlevel-cli/docs/get-firebase-token.md`),
  probe the internal endpoints the workflow BUILDER hits for any per-contact execution /
  enrolment history. The README states the internal API can do what the public one cannot
  (it is how workflows are created). Record whether it also READS enrolment + step state.
- Caveat: internal API is unofficial, unstable, agency-token-only (not per-tenant PIT),
  and would run server-side only. Treat as a source of last resort, not the v1 default.

## 4. Two wiring options

### Option A, Full workflow step history (only if P1+P2, or P5, return real enrolment + step)
- New server endpoint enriches each lead with `{ workflowId, currentStep, repliedStep }`
  from whichever probe succeeded, joined onto `GET /api/sales/leads`.
- Map directly: `sent = currentStep`, `respondedAt = repliedStep`, `outcome` from
  workflow terminal state (replied/booked/won) plus stage cross-check.
- `SEQ` rebuilt from P0 so node count matches the real workflow exactly.
- Preferred: it is the only option that is literally correct per step. Depends entirely
  on the spike finding a step-history source.

### Option B, Inferred from pipeline movement + last-inbound message (fallback, no step history)
Use only P3 + P4, which we know exist. Derive `fu` heuristically server-side:
- **`respondedAt` / replied:** first inbound message timestamp exists -> the lead replied.
  Map it to the nearest `SEQ` step by comparing the inbound time to each step's delay
  from lead creation (`createdAt`). No exact step, but a plausible one.
- **`sent`:** min(count of outbound automated messages, `SEQ.length`); or, if messages are
  not reliably flagged automated, derive `sent` from elapsed time since `createdAt` against
  the `SEQ` delay ladder (after +1h two steps have plausibly fired, etc.).
- **`outcome`:** pipeline stage first (Lead Responded -> replied, Estimate/Intro Scheduled
  -> booked, Job Booked/Completed -> won, terminal no-answer stages -> noresponse); fall
  back to "replied" if any inbound exists, else "awaiting" while young, else "noresponse".
- Honors the existing UI rules already written into copy: a reply pauses the sequence, a
  booking pauses it (`docs/connections/leads.md`).
- Label it as inferred in code comments; it is an approximation, not a step ledger. `SEQ`
  still must be corrected from P0 so the ladder length is real even if position is inferred.

## 5. Decision gate

Run the spike, then pick once:

- **If P1 + P2 (public API) return a contact's workflow AND its current step** -> build
  **Option A** off the public API. Best case, per-tenant PIT only, no internal token.
- **Else if P5 (internal/Firebase) reliably READS per-contact step history** -> build
  **Option A** off the internal API, server-side only, documented as unofficial and gated
  on the agency token. Accept the fragility tradeoff only if Option B proves too coarse.
- **Else (no step history anywhere, the expected outcome)** -> build **Option B**, the
  inferred model from P3 (messages) + P4 (pipeline). Ship `SEQ` corrected from P0 so the
  ladder is real, and mark `fu` as inferred.

In all three, P0 is mandatory first: `SEQ.ad` / `SEQ.form` must stop being placeholders
regardless of which option wins.

## 6. References
- `command-center/app/src/lib/leadsHub.ts`, `FollowUp`, `SEQ`, `automationNote`, `mapApiSalesLead`.
- `command-center/app/src/routes/sales/LeadsHub.tsx`, `FuDots`, `FuChip`, `FuTrack` renderers.
- `command-center/app/functions/lib/ghl.ts`, `fetchAllOpportunities`, `shapeOpportunity`, `ApiLead`.
- `command-center/app/docs/connections/leads.md`, the known gap + automations to honour.
- `docs/build-plans/wire-sales-endpoints.md`, pipeline/stage names, the note that the tracker stays on demo.
- `gohighlevel-cli/README.md` + `docs/get-firebase-token.md`, public vs internal API, workflow commands (list/enroll/remove only on public).

---

## Isolation contract (this runs in parallel with the other five plans)

Run in its own Claude instance + git worktree.

- **Spike phase is READ-ONLY:** probe via the `ghl` CLI (gohighlevel-cli/) and
  write findings + the chosen option into THIS md. No app-code edits.
- **If you proceed to build:** you will touch `src/lib/leadsHub.ts` and the Leads
  components, which the action-wiring plan also edits. Do the build phase AFTER
  action-wiring has merged, or coordinate, to avoid a conflict.
- Any demo change goes in `src/demo/handlers/followups.ts`, never in
  `src/demo/handler.ts`.
