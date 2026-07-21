# Internal Notifications Hidden: Spec + Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client never sees an internal notification anywhere in the app. GHL sends workflow alerts ("New Facebook Lead", review redirects) to the owner and to Hauck staff. GHL logs those into contact threads. Today they surface in the client's Inbox as if they were leads.

**Architecture:** One predicate in the shared messaging lib, applied at every read boundary that returns conversations, messages, or lead rows. No component-level filtering: a new surface must inherit the rule by construction, not by remembering to opt in.

**Tech Stack:** Cloudflare Pages Functions (TypeScript), Supabase (Management API migrations), Vitest.

---

## Global Constraints

- **Never name GoHighLevel or GHL in any client-facing UI.**
- **Never use an em dash** in code, comments, copy, or UI text.
- **No stage writes.** This work is read-path only. Nothing here PUTs a `pipelineStageId`.
- **Hidden means hidden.** Jake's explicit call 2026-07-21: no admin escape hatch, no "internal" toggle, no debug view. GHL remains the system of record for confirming a notification fired.
- **Config follows the existing tenant pattern** (`meta_ad_account_id`, `google_place_id`, `ga4_property_id` in `functions/lib/env.ts:88-108`): a `tenants` column resolved in `_middleware.ts`, with an env var as the single-tenant fallback. There is no `clients.yaml` in this repo.

---

# Part 1: Spec

## 1.1 The evidence

Pulled live from Willis (`OznT3yyuwK3dqVXDsCaD`) on 2026-07-21 via the `ghl` CLI. All 15 conversations inspected.

Three of the fifteen are notification sinks, not leads:

| Conversation | Contact shown as | `contact.source` | Carries |
|---|---|---|---|
| `XXqFFiKclTzD6x7uzcpu` | `(313) 405-3227` | `NOTIFICATION` | Owner's phone, SMS alerts |
| `Gjn1WV1ifCtQurno2cDq` | `williswindowashing@gmail.com` | `NOTIFICATION` | Owner's email, email alerts |
| `UissKT6okkBxdpJp87wK` | `jake hauck` | `WEB_USER` | Hauck staff, +1 734 301 0570 |

Representative bodies, verbatim from the API:

```
⚠️ New Lead For Willis Windows
🧑 First Name: Sheryl Harmon
📞 Phone: (734) 765-4414
```

```
Rating: ⭐⭐⭐⭐⭐ (5 Stars)
Note: This is an internal review redirected to your inbox only and not publish online.
```

## 1.2 Two findings that determine the design

**Finding A: internal notifications never appear inside a real lead's thread.**

Scanned every conversation for outbound messages whose `to` differs from the conversation contact's own phone. Result: zero, across all 15. Every internal notification is addressed to a dedicated pseudo-contact that *is* the recipient.

Therefore this is a **conversation-level exclusion**, not a message-level filter. Hide the sink contact and the whole problem disappears.

**Finding B: `source: "workflow"` on a message is NOT the discriminator.**

Legitimate nurture messages carry it too. From Sheryl Harmon's real thread (`r5PU0rCatC77iP7eGoFZ`):

```json
{ "direction": "outbound", "source": "workflow",
  "body": "hey Sheryl, what we usually do is write the address down..." }
```

Filtering on `source: workflow` would erase every follow-up sequence from the client's view. **Do not implement that.** This is the single most likely wrong turn on this task.

## 1.3 Detection: two signals, OR'd

A conversation is internal when **either** holds.

**Signal 1: `contact.source === "NOTIFICATION"`**

GHL sets this itself on contacts it auto-creates for notification actions. Zero config. Catches sinks 1 and 2.

**Signal 2: contact phone or email matches the tenant's internal-recipient list**

Catches staff and owner contacts, which are `WEB_USER` and which Signal 1 will never see. Catches sink 3.

Neither signal alone is sufficient. Signal 1 alone leaves "jake hauck" in Willis's inbox. Signal 2 alone requires hand-maintaining every owner notification address.

**Matching rules.** Phones compare on digits only, last 10 digits, so `+17343010570`, `(734) 301-0570`, and `7343010570` all match. Emails compare case-insensitively after trim. A blank list entry never matches anything, so an empty or malformed config fails **open** (shows the conversation) rather than silently hiding a real lead.

**Rejected: shape-based auto-detection.** "All outbound, never replied" also describes Gayle Carnwath Hewines, a real Facebook lead who has not answered yet. It would hide real leads. Not used, not even as a hint.

## 1.4 Where the rule applies

Every read path that can surface a conversation, a message, or a lead row.

| Surface | File |
|---|---|
| Inbox list | `functions/api/conversations/index.ts` |
| Thread fetch | `functions/api/conversations/[contactId]/messages.ts` |
| Send (blocked) | `functions/api/conversations/[contactId]/send.ts` |
| Lead thread | `functions/api/leads/[id]/messages.ts` |
| Reactivation | `functions/api/reactivation/messages.ts` |
| Sales leads | `functions/api/sales/leads/index.ts` |
| Contact cockpit | inline thread on the contact detail route |

Send is blocked as well as read. A sink conversation must not be repliable even if a stale client holds its id.

## 1.5 Extending to lead lists and counts

Jake's call 2026-07-21: extend beyond inboxes.

The sink contacts hold **no opportunities today**, verified against the live opportunity list, so pipeline counts are currently clean. Nothing prevents a NOTIFICATION contact from acquiring one and inflating the client's lead numbers. The same predicate therefore gates lead rows and any count derived from them.

## 1.6 Out of scope

- The internal team chat (`/comms`), notification center (`/notifications`), and `/admin/messages`. Those are deliberately internal surfaces, not client inboxes.
- Deleting or editing the sink contacts inside GHL. The app hides them; GHL keeps them, because the notifications must keep firing.
- Rewriting the GHL workflows to stop creating sink contacts. Larger change, separate decision.

---

# Part 2: Implementation Plan

## Task 1: The predicate, test-first

- [ ] Add `functions/lib/internalRecipients.ts` exporting `isInternalRecipient(contact, list)`.
- [ ] `normalizePhone(raw)`: strip non-digits, take last 10, return `""` if fewer than 10 remain.
- [ ] `normalizeEmail(raw)`: trim and lowercase.
- [ ] `parseInternalRecipients(raw)`: accept a comma or newline separated string, drop blanks, classify each entry as phone or email by presence of `@`.
- [ ] Write `functions/lib/internalRecipients.test.ts` FIRST, using the six real payloads in section 1.1 and 1.2:
  - Positive: `source: "NOTIFICATION"` with any list, including an empty list.
  - Positive: `jake hauck` / `+17343010570` when the list holds `7343010570`.
  - Positive: same contact when the list holds `(734) 301-0570`.
  - Positive: `williswindowashing@gmail.com` when matched by email, case-mismatched.
  - Negative: Sheryl Harmon, `source: "Facebook"`, empty list.
  - Negative: Gayle Carnwath Hewines, real lead, no replies yet. Guards against shape-based regression.
  - Negative: empty and whitespace-only list entries match nothing.
- [ ] Confirm the tests fail, then implement until green.

## Task 2: Tenant config

- [ ] Migration adding `internal_recipients text` to `tenants`, nullable. **Pick the migration number at PUSH time, not now.** Numbering is a race; 0042 was the last known.
- [ ] Add `internal_recipients?: string` to `TenantContext` in `functions/lib/env.ts`, documented in the same comment style as `meta_ad_account_id`.
- [ ] Resolve it in `functions/api/_middleware.ts` from the tenants row, falling back to an `INTERNAL_RECIPIENTS` env var.
- [ ] Seed Willis with the owner's mobile, `williswindowashing@gmail.com`, and `+17343010570`.
- [ ] Push the env fallback via Doppler (`hauck-command-center` / `prd`), per standing rule. No secrets in code.

## Task 3: Apply at the read boundaries

- [ ] `functions/api/conversations/index.ts`: `contact.source` is already in hand at line 104. Extend the existing `.filter()` at line 76 to drop internal conversations. This is the smallest change and the highest-value one.
- [ ] `functions/api/conversations/[contactId]/messages.ts`: resolve the contact, return 404 when internal. Not an empty thread: a sink must not look like a real contact with no history.
- [ ] `functions/api/conversations/[contactId]/send.ts`: return 403 when internal.
- [ ] `functions/api/leads/[id]/messages.ts`: same treatment as the thread fetch.
- [ ] `functions/api/reactivation/messages.ts`: apply alongside the existing origin filter.
- [ ] `functions/api/sales/leads/index.ts`: drop internal contacts from lead rows and from any count derived from them.
- [ ] Contact cockpit inline thread: `ContactDetailDesktop.tsx` renders the last six messages without going through `ConversationThread`, so trace which endpoint feeds it and cover that endpoint. Do not filter in the component.
- [ ] Grep for remaining callers of `fetchContactThread` and `fetchAllConversations` and confirm each one is covered. Any uncovered caller is a leak.

## Task 4: Verify against live data

- [ ] `npm test` green, including the new predicate suite.
- [ ] `npx tsc --noEmit` clean.
- [ ] Re-run the live scan from section 1.1. Expect exactly three conversations to disappear and twelve to remain.
- [ ] Confirm Sheryl Harmon's thread still shows all ten messages, including the `source: workflow` nurture sends. This is the regression that matters most.
- [ ] Screenshot the client Inbox before and after.

## Task 5: Ship

- [ ] Commit, push, watch the Cloudflare deploy. Poll for a **string**, never the local bundle hash: CF builds a different hash.
- [ ] Smoke-test the live URL. If the tab serves a stale bundle, bust the service worker (`getRegistrations` → unregister, `caches.keys` → delete, reload).
- [ ] `git rm` this plan in the ship commit, per standing rule.
- [ ] Append any leftover Jake actions to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md` before deleting.

---

## Definition of Done

- Willis's Inbox shows twelve conversations, not fifteen.
- "jake hauck", "(313) 405-3227", and "williswindowashing@gmail.com" appear in no inbox, no lead list, and no count.
- Sheryl Harmon's nurture sequence renders in full.
- A new message-bearing endpoint that forgets the predicate is the only way to reintroduce the bug, and Task 3's grep step documents where to look.
