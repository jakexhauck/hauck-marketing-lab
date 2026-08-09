---
type: plan
title: "GHL Workflow Restructure Plan — Sales"
status: draft
tags: [plan, feature]
plan_kind: feature
created: "2026-06-08T17:30:32.000Z"
source: "docs/build-plans/GHL Workflow Restructure/PLAN.md"
---

# GHL Workflow Restructure Plan — Sales

**Account:** `r0WfsA12qpBv7M185V3v`. Was the Hauck Marketing test sub-account when this plan was written; **it is Made Better Landscaping Co's own sub-account as of 2026-08-09**, so anything here is being done inside a live client.
**Date:** 2026-05-29
**Scope:** Sales workflows only. Review Management, Attribution, and Reporting were intentionally skipped.
**Status of account today:** Every workflow is in **draft**, 0 enrolled. This is a build/staging ground, so we can restructure freely without disrupting live contacts.

> Goal: one job per workflow. Right now most workflows do three or four jobs at once (notify + tag + move pipeline + drip + win-back). We separate those jobs into single-purpose workflows that hand off to each other through tags, so the whole funnel is congruent and easy to maintain.

---

## 1. What exists today (current inventory)

12 sales-relevant workflows across two folders.

### Folder: 🛠️ Workflows (entry points / infrastructure)

| Workflow | Trigger | What it actually does | Verdict |
|---|---|---|---|
| Auto Missed Call Text Back | Inbound call: busy / voicemail / no-answer | Delay, add tag, text the lead back, notify team | **Clean. Single purpose.** Keep as the model. |
| Chat Widget | Customer replied via Chat Widget | Intake (lead-in + email/SMS notify + chat tag) **plus** a full multi-step nurture drip with reply branches | **Mixed.** Intake fused with nurture. |
| Website Form | Website Form submitted | Intake (form-filled + email/SMS notify + tag + "thanks/next steps") **plus** full nurture drip | **Mixed.** Same drip engine as above. |
| DR Activation Workflow | Tag added: `re-activation start` | Reactivation drip (email/SMS, waits, reply branches, notify) | **Mostly clean.** Tag-triggered, good pattern. |
| OPT OUT | Customer replied (SMS or Email) | Detects "OPTOUT/STOP", confirms opt-out | **Clean compliance.** Keep. |

### Folder: 🚨 Sales › Follow Up's/Reminders

| Workflow | Trigger | What it actually does | Verdict |
|---|---|---|---|
| 1. FB Survey/Quiz Submitted | Survey submitted (FB AD's Survey) | "No appointment booked" check, FB Lead tag, lead-in email/SMS notify | **Misfiled.** This is intake/notification, not a follow-up. Overlaps Lead Form intake. |
| 2. Estimate Reminders | Appointment Status (x2 triggers) | Remove tag, remove from FB Ads pipeline, **move to Sales pipeline**, remove from workflow | **Mislabeled.** No reminders exist. It is a pipeline transition. |
| Intro Call Winback Sequence | Pipeline stage changed → FB Ads pipeline, "Winback Sequence" stage | Condition + pipeline move + nurture tag + 3hr wait + ~8-day SMS/Email drip + Move To Abandoned (broken) | **Mega-workflow.** 5 jobs in one. |
| Lead Form Follow Up's | Facebook Lead Form submitted | Intake (lead-in notify + FB Lead tag) + "thanks/next steps" + multi-step drip with reply branches | **Mixed.** Intake + nurture. Duplicates FB Survey intake. |
| intro appointment win back sequence REDO | (none attached) | Byte-for-byte copy of Intro Call Winback Sequence, missing its trigger | **Duplicate.** Redundant. |

### Folder: 🚨 Sales (appointment lifecycle)

| Workflow | Trigger | What it actually does | Verdict |
|---|---|---|---|
| Intro Call Booked | Customer booked appointment (Intro Call calendar) | Confirmation SMS + "Schedule" tag + appt-booked email/SMS notify + **move pipeline to Intro Call** + wait-for-reply + reply branches | **Mixed.** Confirmation + notify + pipeline + reply handling. |
| Intro Call No-Show Alert REDO | Appointment Status (confirmed + 2 more) | Wait until 5 min before appt + Update Pipeline (broken) + "Call Back Booked" tag + remove from workflow | **Half-built + mislabeled.** Name says no-show, build says appt-status/callback. |

---

## 2. The core problems

1. **Mixed responsibilities.** Most workflows fuse 3 to 5 jobs: intake notification, tagging, pipeline movement, nurture drip, reply handling, and abandonment. When one piece breaks or needs a copy change, you have to open a giant flow and risk the rest.

2. **Heavy duplication (3 separate cases).**
   - The intake-plus-drip engine is copy-pasted across **Lead Form Follow Up's, Chat Widget, and Website Form** (confirmed identical internal node IDs). Three places to edit one follow-up.
   - The winback sequence exists **twice** (Intro Call Winback Sequence and intro appointment win back sequence REDO).
   - FB lead intake (FB Lead tag + lead-in notifications) is duplicated across **FB Survey/Quiz Submitted and Lead Form Follow Up's**.

3. **Mislabeled workflows.** "Estimate Reminders" moves pipelines (no reminders). "Intro Call No-Show Alert REDO" handles appointment status/callback (not really no-shows). Names cannot be trusted, which makes the account hard to reason about.

4. **Broken pipeline steps.** "Move To Abandoned" (both winback copies) and "Update Pipeline" (No-Show REDO) show error icons. The opportunity stage moves are not fully configured.

5. **Pipeline logic is scattered.** Stage changes happen inside Intro Call Booked, Estimate Reminders, Winback, and No-Show. There is no single place to see or maintain "how a lead moves through the funnel."

6. **Clutter.** Multiple "REDO" versions, "⏳" to-do markers, everything in draft, parallel half-built copies.

---

## 3. The restructuring principle: layers

Split every workflow into one of six single-purpose layers. Each layer hands off to the next using **tags and pipeline-stage triggers**, never by doing the next layer's job itself.

```
LAYER 1  Intake / Capture        →  tag the source, notify team, set "New Lead" stage, STOP
LAYER 2  Speed-to-Lead (1 shared) →  first text + early follow-up drip (triggered by a generic new-lead tag)
LAYER 3  Pipeline Automation      →  ONLY moves opportunity stages, on events/tags
LAYER 4  Appointments             →  Booked (confirm + remind), No-Show (recover), Reschedule
LAYER 5  Nurture / Winback        →  long drips, triggered by stage or tag
LAYER 6  Compliance               →  opt-out (already clean)
```

Why this works: a lead from a missed call, a form, the chat widget, or an FB survey should all get the **same** first-touch experience. Today each channel reinvents it. With layers, the channel intake just drops a `new-lead` tag and Layer 2 takes over. Edit the follow-up once, every channel benefits.

---

## 4. Proposed folder structure

Rename the Sales folder's contents into numbered sub-folders so the run order is obvious:

```
🚨 Sales
 ├── 0 · Compliance
 │     └── Opt-Out (SMS + Email)
 ├── 1 · Intake (one per source, all end by tagging "new-lead")
 │     ├── Intake — Facebook Lead Form
 │     ├── Intake — FB Survey/Quiz
 │     ├── Intake — Website Form
 │     ├── Intake — Chat Widget
 │     └── Intake — Missed Call
 ├── 2 · Speed-to-Lead
 │     └── New Lead — First Response & Follow-Up (ONE shared drip)
 ├── 3 · Pipeline Automation
 │     ├── Stage — New Lead → Contacted
 │     ├── Stage — Booked Intro Call
 │     ├── Stage — Showed / No-Show
 │     └── Stage — Won / Lost
 ├── 4 · Appointments
 │     ├── Intro Call — Confirmation & Reminders
 │     ├── Intro Call — No-Show Recovery
 │     └── Intro Call — Winback
 └── 5 · Nurture
       ├── Long-Term Nurture
       └── Database Reactivation (DR)
```

(Keep 🌟 Review Management, 🎯 Attribution, 📊 Reporting as their own top-level folders, untouched for now.)

---

## 5. Workflow-by-workflow: what to split

### Intro Call Booked  →  split into 3
- **Keep (Layer 4):** confirmation SMS + appointment reminders (24h / 1h before).
- **Move out (Layer 3):** the "move pipeline to Intro Call" step becomes part of "Stage — Booked Intro Call".
- **Move out (Layer 2 or notifications utility):** internal team email/SMS "appointment booked" alerts.
- The "wait for reply / reply branch" logic belongs in the shared Speed-to-Lead follow-up, not here.

### Intro Call Winback Sequence + intro appointment win back sequence REDO  →  merge into 1, split jobs out
- **Delete the REDO duplicate** (it has no trigger and is identical).
- **Keep (Layer 4 Winback):** the multi-day SMS/Email drip only.
- **Move out (Layer 3):** "Update Pipeline Stage" and "Move To Abandoned" go to the Pipeline Automation layer, and **fix the broken Move To Abandoned step** (reconfigure the target pipeline/stage).
- The "Was an intro call booked?" gate becomes the enrollment trigger/condition, not an in-flow branch.

### Estimate Reminders  →  rename + relocate
- This is a **pipeline mover**, not reminders. Rename to "Stage — Move FB Ads → Sales Pipeline" and put it in Layer 3.
- If you actually want estimate reminders (follow-ups after a quote is sent), that is a **new** Layer 4 workflow to build (see holes below).

### Intro Call No-Show Alert REDO  →  rebuild as real no-show recovery
- Trigger should be appointment status = **no-show** specifically.
- Job: tag `no-showed`, fire a recovery sequence (text + rebook link), and let Layer 3 handle the stage change.
- **Fix the broken Update Pipeline step.**

### FB Survey/Quiz Submitted + Lead Form Follow Up's  →  separate intake from follow-up
- Each becomes a thin **Layer 1 Intake** workflow: tag the source (`fb-survey` / `fb-lead`), notify team, add the shared `new-lead` tag, then STOP.
- Their drip/follow-up content collapses into the **one** shared Speed-to-Lead workflow.

### Chat Widget + Website Form  →  same treatment
- Thin intake (tag `chat-lead` / `website-lead`, notify, add `new-lead`, STOP).
- Drip collapses into the shared Speed-to-Lead workflow.

### Auto Missed Call Text Back  →  keep, with one change
- It is already single-purpose. Add the `new-lead` tag at the end so missed-call leads also flow into Speed-to-Lead.

### DR Activation  →  keep
- Already tag-triggered and reasonably single-purpose. Lives in Layer 5.

### OPT OUT  →  keep
- Clean. Layer 0/Compliance.

---

## 6. Tag taxonomy (the glue)

Standardize tags so workflows hand off cleanly. Suggested naming (lowercase, hyphenated):

**Source tags (set by intake):** `src-fb-lead`, `src-fb-survey`, `src-website`, `src-chat`, `src-missed-call`

**Lifecycle / status tags (drive downstream workflows):**
- `new-lead` — triggers Speed-to-Lead
- `lead-responded` — pauses drips, alerts team
- `call-booked`, `no-showed`, `call-back-booked`
- `nurture`, `abandoned`, `re-activation start`
- `dnd-optout`

Rule of thumb: **intake adds source + `new-lead`; everything downstream is triggered by a tag or a pipeline-stage change, not by being wired inline.** This is what makes the system congruent.

---

## 7. Holes to patch (what is missing for this business)

1. **Real appointment reminders.** There is no 24h / 1h pre-call reminder sequence. "Estimate Reminders" is misnamed and does pipeline moves. Build a proper reminder workflow (Layer 4).
2. **Post-call outcomes.** Nothing handles **Won** (→ onboarding/handoff) or **Lost** (→ long-term nurture). The funnel currently dead-ends at booking/winback.
3. **Estimate / quote follow-up.** If you send quotes, there is no "quote sent → follow up until accepted" sequence.
4. **Reschedule path.** No-shows only get a tag; there is no rebook/reschedule flow.
5. **Centralized reply handling.** "If Lead Responded" logic is duplicated in every drip. Centralize it in the shared Speed-to-Lead workflow so a reply universally pauses follow-ups and alerts the team.
6. **Single pipeline-control layer.** Today no one workflow owns the funnel stages. Layer 3 fixes this.
7. **Fix the two broken steps** (Move To Abandoned, Update Pipeline) before publishing anything that depends on them.

---

## 8. Net result

- **From 12 tangled drafts → roughly 14 single-purpose workflows**, but each does exactly one job and most are shared rather than duplicated.
- The 3 copy-pasted intake+drip engines collapse to **1** shared follow-up.
- The 2 winback copies collapse to **1**.
- Pipeline logic lives in **1** layer instead of scattered across 4 workflows.
- Names match behavior, so the account is finally readable.

---

## 9. Recommended next steps (checklist)

1. Approve this layered structure (or tell me what to change).
2. Create the numbered sub-folders inside 🚨 Sales (Section 4).
3. Delete `intro appointment win back sequence REDO` (confirmed duplicate, no trigger).
4. Lock the tag taxonomy (Section 6) so every workflow uses the same names.
5. Build the **one** shared "New Lead — First Response & Follow-Up" workflow; point all 5 intakes at it via the `new-lead` tag.
6. Strip each intake workflow down to: tag source + notify team + add `new-lead` + stop.
7. Build the Layer 3 "Pipeline Automation" workflows and move every pipeline-stage action out of the lifecycle/nurture flows into them.
8. Fix the two broken steps (Move To Abandoned, Update Pipeline).
9. Rename "Estimate Reminders" → "Stage — Move FB Ads → Sales Pipeline" and relocate to Layer 3.
10. Rebuild "No-Show Alert" as real no-show recovery (trigger on status = no-show).
11. Build the missing pieces: appointment reminders, Won/Lost outcomes, quote follow-up, reschedule.
12. Test each workflow with a dummy contact, then publish layer by layer (Compliance → Intake → Speed-to-Lead → Pipeline → Appointments → Nurture).
