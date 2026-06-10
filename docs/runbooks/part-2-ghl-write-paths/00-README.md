# Part 2: GHL Write-Path Correctness

Status: code **done 2026-06-10** (committed and pushed) | manual actions ☐ not started

Theme: every place the app **writes to or reads deeply from** GoHighLevel that is currently broken, silently failing, or truncating. After this part, the things clients tap actually happen in GHL, and what they read is complete.

## What gets fixed (from the audit)

| # | Finding | Where | Severity |
|---|---|---|---|
| 2.1 | "Marked Won" note posted to `POST /opportunities/{id}/notes`, which is not a real GHL v2 endpoint; 404s invisibly on every win | `functions/api/leads/[id].ts` | High |
| 2.2 | Lead notes written as a `notes` field on `PUT /opportunities/{id}`; not a writable v2 field, so adding a note to a lead is a silent no-op | `functions/api/leads/[id].ts`, `functions/lib/ghl.ts` | High |
| 2.3 | Task creation omits the required `completed` field; likely 422 on every create. Task update can drop `dueDate` and crashes on `body: null` | `functions/api/contacts/[contactId]/tasks.ts`, `tasks/[taskId].ts` | High |
| 2.4 | Numeric GHL message `type` crashes thread endpoints (`.toUpperCase()` on a number); channel misclassification | `functions/api/conversations/[contactId]/messages.ts`, `functions/api/leads/[id]/messages.ts`, `functions/lib/messaging.ts` | High |
| 2.5 | Rep lead filtering dead: frontend adapter hardcodes `assignedUserId: null`, so reps see zero leads | `src/context/LeadsContext.tsx` | High |
| 2.6 | Message threads truncate at GHL's default ~20 messages (no limit param, no pagination) | both messages endpoints | Medium |
| 2.7 | Conversations list capped at 100: code looks for cursors the search endpoint never returns | `functions/api/conversations/index.ts` | Medium |
| 2.8 | Only the first conversation per contact is shown; replies can go to a different thread than displayed | both per-contact messages/send paths | Medium |
| 2.9 | 5xx retry re-sends non-idempotent POSTs (duplicate SMS risk); no 429 handling | `functions/lib/ghl.ts` | Medium |
| 2.10 | `value: null` on lead update conflates "clear value" with `$0` | `functions/api/leads/[id].ts` | Low |
| 2.11 | Bare `ctx.request.json()` returns 500 instead of 400 on malformed bodies in 5 routes | leads/conversations send routes | Low |
| 2.12 | Won-note copy brands client data with "Via Hauck Dashboard" and assumes USD | `functions/api/leads/[id].ts` | Low |

## Files in this folder

- [01-implementation-spec.md](01-implementation-spec.md): the exact change plan Claude executes.
- [02-manual-actions.md](02-manual-actions.md): your checklist, including the one-time admin/team-sync setup that rep filtering needs, and in-app verification scripts against the test GHL account.

## Done means

- Typecheck and production build pass.
- All 12 findings closed in code.
- Your verification script in 02 passes end to end against the test sub-account: a Won note lands on the contact in GHL, an app-created task appears in GHL, a 30+ message thread renders fully, and a rep identity sees exactly their assigned leads.
