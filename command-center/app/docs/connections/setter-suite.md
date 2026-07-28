# Setter Suite vs the rebuilt CRM: audit 2026-07-28

Audited two accounts with the `ghl` CLI (pipelines, tags) and the internal API
(each workflow's triggers and steps):

- **Willis Windows** (`OznT3yyuwK3dqVXDsCaD`), 50 workflows. This is production.
- **Test template** (`r0WfsA12qpBv7M185V3v`), 29 workflows. Cloned per client.

Note: GHL does not expose workflow folder NAMES over the API, only a `parentId`
per workflow, so every Willis workflow was exported and grouped by folder rather
than picked by folder name. Nothing was skipped.

Second note: the `ghl` CLI's own stored token is dead (401 on every public-API
call). This audit ran on the app's `GHL_TOKEN` / `TEST_GHL_TOKEN`. Refresh the
CLI's `.env` before anyone trusts a bare `ghl` command again.

**Verdict: Willis's CRM is ahead of the app.** Jake rebuilt Willis onto the new
four-pipeline structure and published the whole tag engine. The Setter Suite
still speaks the old vocabulary, so it cannot drive it. Nothing crashes, which
is worse: every button still renders and several now do nothing.

---

## 1. The structure the app has to speak

Willis and the test account now match. Willis keeps four extra pipelines
(Organic, Google Reviews, Reactivation, News Channel) alongside.

```
1) Leads      Lead Form Opt In · Funnel Opt In · Lead Follow Up · Phone Appt ·
              Slow Burn · Long Term Nurture
2) No Answer  No Answer Day 1 ... Day 7
3) Sales      Estimate Booked · Job Booked · Won · Lost · Follow Up ·
              Job/Estimate Cancelled
4) Trash      Services Uninterested · Services Unqualified · Bad Intent
```

Three changes matter more than the renames:

1. **"(needs dialing)" is gone.** Not one live stage carries the marker.
2. **The no-answer chain has its own pipeline** and runs to Day 7, not Day 4.
3. **Phone appointments collapsed to one stage.** Booked, confirmed and
   unqualified are now TAGS on a single "Phone Appt" stage, not three stages.

There is also no longer a **"Handed Off"** stage anywhere.

---

## 2. Willis: the tag engine, and what is wired

Published and healthy. These are live and waiting on tags the app must send:

| Workflow | Listens for | Does |
|---|---|---|
| 📋📵 No Answer Tags (Lead Form) | `no answer day 1` ... `day 7` | walks 2) No Answer Day 1 to 7, clearing the previous day's tag |
| 🌐📵 No Answer Tags (Funnel) | the same seven | same walk, funnel copy |
| 📝 Post Dial Tags | `lead form follow up`, `funnel follow up` | moves to 1) Leads / Lead Follow Up |
| 🤝 Phone Appointment Confirmed | appointment confirmed on the funnel or dialer calendar | adds `phone appointment booked` + `confirmed`, strips `unqualified` and all three `cancelled appointment` tags |
| 📞 Phone Appointment Booked | new booking on the funnel calendar | moves to 1) Leads / Phone Appt, auto-confirms |
| ❌ Phone Appointment Cancelled | `cancelled appointment rescheduling` / `follow up` | cancels the booking, returns to 1) Leads / Phone Appt |
| 🧹 Removing Opportunities | stage change in any of the four | clears the stale card from the other three |
| ✅ New Lead Follow Ups | Facebook lead form, funnel survey | tags and creates the opportunity in 1) Leads |

The legacy numbered folder (1) New Lead through 14) Canceled Phone Appointments)
is still published, but every one of those is now just a webhook POST to
`app.hauckmarketing.com/api/webhook`. That is the instant-sync feed, not a
competing stage engine. No conflict.

### 2.1 Four published Willis workflows write into deleted pipelines

This is losing data on production today.

| Workflow | Broken branch | Writes into |
|---|---|---|
| 💰 Owner Outcome Tags | Won, Lost, Follow Up, Job/Estimate Cancelled (all four) | deleted old Sales pipeline `7MJx8GtDCrni5AO54sGQ` |
| 🔔 Estimate/Job Reminders | Estimate Booked, Job Booked | same deleted pipeline |
| 📝 Post Dial Tags | Services Uninterested, Services Unqualified | deleted pipeline `a5pbDcaX1L0g7ycsrF1j` |
| ❌ Phone Appointment Cancelled | Uninterested branch | same deleted pipeline |

So on Willis right now: every owner outcome (won, lost, follow up, cancelled),
both booking confirmations, and every uninterested / unqualified dispositions
create an opportunity in a pipeline that does not exist. Those cards appear on
no board, in the Setter Suite or the client app. Only the follow-up branch of
Post Dial Tags still lands correctly.

🚫 OPT OUT (draft) points at a third deleted pipeline, `j224qRt287HTVnzkUghk`.

---

## 3. Test account: same engine, still switched off

The test template carries the same rebuilt pipelines and the same tag engine,
but every workflow in that engine is **draft with inactive triggers**, so
nothing fires there. Six of its published legacy workflows (Intake — New Lead
Day 1, Appointments — Booked, Nurture — Day 2–5, and the three Showroom
appointment ones) still write into deleted pipeline `R94EnXJkgMKFlyMiaksH`.

The template has to be fixed before the next client is cloned from it, or the
new client inherits all of this.

---

## 4. What was broken in the Setter Suite

**Status: fixed in code 2026-07-28, running on localhost, not yet deployed.**
Full suite green (1977 tests), typecheck clean, production build clean, and the
rebuilt logic re-run against the live Willis pipeline dump to confirm each
symptom below is gone. Sections 4.1 to 4.8 are kept as the record of what the
symptoms were; the fix for each is noted inline.

Verified by running the shipped functions (`shapeSetterPipeline`,
`stageActionsFor`, `isApptBookedStage`, `isApptConfirmedStage`,
`statusForStage`) against the live pipeline dump. Every line is an observed
output, not a reading of the code.

### 4.1 The No Answer button is gone from every stage

`src/lib/setterStageActions.ts:48-55` keys the chain on the old names
("no answer day 1 (needs dialing)" and friends). None match, so no stage renders
a No Answer button and the app can no longer emit `no answer day 1`. Days 5, 6
and 7 were never in the map at all.

Willis has both No Answer workflows published and wired for all seven days,
waiting for a tag the app cannot send. **This is the single biggest gap: the
core loop of the suite is dead.**

### 4.2 Funnel leads get the wrong follow-up tag

`followUpTagFor` (line 58) picks the tag by testing the PIPELINE name for
"funnel". Funnel leads now sit in "1) Leads" at the "Funnel Opt In" STAGE, so
the test never passes and everything gets `lead form follow up`. Willis's funnel
follow-up path can never be entered.

### 4.3 No appointment is tracked on any lead

`isApptBookedStage` / `isApptConfirmedStage` (`src/lib/setterApptConfirm.ts`)
return false for all 21 stages, so `isApptTrackedStage` is false everywhere.
That kills the appointment lookup, the 24 hour manual-confirm alert, and the
cancel / reschedule targets in one go.

The new model tracks booked-vs-confirmed by tag on the single "Phone Appt"
stage. This module has to read tags, not stage names.

### 4.4 The confirmed-call cockpit never renders, and its tags are wrong

`stageActionsFor` looks for a stage containing "appt confirmed". No such stage
exists, so Reschedule and Cancel + Follow Up are unreachable.

They would not work if they were: they apply `cancelled-call-rescheduling` and
`cancelled-call-follow-up` (lines 81, 88), while Willis's ❌ Phone Appointment
Cancelled listens for `cancelled appointment rescheduling` and
`cancelled appointment follow up`. Different strings. Applying them would create
two junk tags and fire nothing.

### 4.5 "Needs dialing" is false on all 21 stages

`functions/api/admin/setter/pipelines.ts:53` flags a stage with
`/needs dialing/i`. Nothing matches, so the board's needs-dialing chip and the
per-card signal (`SetterBoard.tsx:106`) are permanently off. The board no longer
tells the setter which column to work.

### 4.6 Follow Up shows where it is nonsense

With no stage whitelist, the default branch puts a Follow Up button on Won,
Lost, Job Booked, Estimate Booked, all seven No Answer days and all three Trash
stages. Tagging a won job `lead form follow up` drags it back into
1) Leads / Lead Follow Up, because Post Dial Tags is published on Willis.

### 4.7 Client-facing status is wrong for four stages

`functions/lib/leadStatus.ts` falls back to "new" for anything unmapped:

| Stage | Client sees | Should be |
|---|---|---|
| Lead Follow Up | New | Contacted |
| Phone Appt | New | Phone appointment booked |
| Slow Burn | New | its own state, or nurture |
| Job/Estimate Cancelled | New | follow-up or lost |

A won-then-cancelled job reads to the client as a brand new lead.

### 4.8 Hand-offs lost their target stage

`functions/api/handoffs/shared.ts` resolves the Sales pipeline by name
("3) Sales" still matches) and then the stage by name. Five of the six statuses
still resolve. `new` wants a **"Handed Off"** stage, which no longer exists, so
it falls through to `WILLIS_STAGE_IDS.new`, a hardcoded id in the deleted old
Sales pipeline. The Willis fallback ids on lines 65-72 are all dead now.

---

## 5. The fix

### 5.1 CRM side (done by Jake, verified 2026-07-28)

| Edit | Verified |
|---|---|
| 💰 Owner Outcome Tags repointed at 3) Sales (Won, Lost, Follow Up, Job/Estimate Cancelled) | ✅ |
| 📝 Post Dial Tags repointed at 4) Trash (uninterested, unqualified) | ✅ |
| ❌ Phone Appointment Cancelled repointed at 4) Trash | ✅ |
| 🔔 Estimate/Job Reminders repointed at 3) Sales (Estimate Booked, Job Booked) | ✅ |
| "Handed Off" stage added back at the top of 3) Sales | ✅ |

**Jake's rule on hand-offs, recorded here because the code now depends on it:**
the "Handed Off" stage is **Willis only**. Every client after Willis hands off
at the moment the estimate is booked, so "Estimate Booked" is the hand-off for
them and no separate stage exists.

Still open on the CRM side:

- 🚫 OPT OUT (draft) still creates an opportunity in the deleted pipeline
  `j224qRt287HTVnzkUghk`. Harmless while it stays draft.
- The **test template** still has all of this wrong: same dead-pipeline writes
  in six published workflows, and its whole tag engine unpublished. It has to be
  brought in line with Willis before the next client is cloned from it.

### 5.2 App side (built 2026-07-28)

| # | Change | Where |
|---|---|---|
| 1 | No-answer chain rebuilt on the live names, Day 1 through Day 7, opt-in and follow-up stages starting it at Day 1 | `src/lib/setterStageActions.ts` |
| 2 | Follow-up tag now decided by the lead's ORIGIN tag (`funnel survey completed` / `lead form`), stage name as fallback, since the funnel and lead form share one pipeline | `setterStageActions.ts` |
| 3 | Appointment booked / confirmed switched from stage names to the two live tags; restores appointment tracking, the 24 hour manual-confirm alert, and the on-call panel | `src/lib/setterApptConfirm.ts` |
| 4 | Cancelled-appointment tags corrected to the three live strings, and the appointment cancel left to the automation rather than done twice | `setterStageActions.ts` |
| 5 | "(needs dialing)" replaced by a derived signal: any stage in 1) Leads or 2) No Answer except the two parking stages | `functions/api/admin/setter/pipelines.ts` |
| 6 | Dialing panel restricted to the dialing pipelines; Sales, Trash, Reviews and Reactivation fall through to the generic cockpit instead of offering buttons that would drag a won job backwards | `setterStageActions.ts` |
| 7 | Board leads now carry `tags`, which the opportunity search already returned inline (no extra request) | `functions/api/admin/setter/leads.ts`, `functions/lib/ghl.ts` |
| 8 | Four new stages mapped for the client-facing status, plus the old names kept for any client not yet migrated | `functions/lib/leadStatus.ts` |
| 9 | Hand-off stage resolved by name, falling back to Estimate Booked per Jake's rule; the dead hardcoded Willis pipeline and stage ids deleted; "Job/Estimate Cancelled" no longer mis-reads as an estimate | `functions/api/handoffs/shared.ts` |

Evidence: `npm test` 1977 passed / 151 files, `npm run typecheck` clean,
`npm run build` clean. The rebuilt logic was then run against the live Willis
pipeline dump: every stage in 1) Leads and 2) No Answer renders its buttons,
the chain walks Day 1 to Day 7 and stops, Phone Appt gets the on-call panel with
the live tag names, and all of 3) Sales and 4) Trash falls through to the
generic cockpit.

Still open on the app side:

- `docs/build-plans/setter-suite.md` section 1.2 still describes the old eight
  pipelines. Left alone deliberately: that is the original build plan, and it is
  a historical record rather than live documentation.
- Not deployed. Running on localhost only, per the standing rule that shipping
  is a separate, approved step.
