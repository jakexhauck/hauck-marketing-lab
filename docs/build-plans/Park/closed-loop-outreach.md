# 03 — Closed-loop outreach (send + classify + draft reply)

> **Status:** Proposed. Build third.
> **Effort:** 3–5 days end-to-end. Send pipe + reply ingest + classifier + draft loop.
> **Why this matters:** The single biggest top-of-funnel lever. Today outreach stops at "leads in a CSV." This is what turns leads into booked discovery calls without Jake personally pasting every email.
> **Depends on:** [activity-log-and-memory-writeback.md](activity-log-and-memory-writeback.md) (every send/reply is an event), [_legacy-02-outreach-send-and-reply-tracking.md](_legacy-02-outreach-send-and-reply-tracking.md) (read for the prospect schema, sequence file format, and prior architectural decisions).

---

## Why this matters

The OutreachHub UI is built. The scraper produces leads. Sequences exist. None of it sends mail. Every outbound email today is Jake pasting a draft into Gmail manually — a hard ceiling on volume at exactly the moment volume is the lever.

This is the build that converts the agency from "as many clients as Jake can personally prospect" into "as many as can be delivered."

## What we have today

- `OutreachHub.tsx`, `OutreachProspectPage.tsx`, `OutreachSequencePage.tsx` — UI for managing prospects + sequences.
- `lead-scraper/` — produces prospect CSVs.
- Gmail MCP — read + draft only (Anthropic gates `send` behind a human click intentionally).
- GHL (GoHighLevel) — could absorb the send + reply pipeline entirely if Jake prefers that path.
- Vortex agent — already configured to write copy in Jake's voice.

## The send path — two options

Anthropic's Gmail MCP cannot send programmatically. Two real options:

**Option A: Gmail API direct.** New `app/src-tauri/src/gmail_send.rs`. OAuth Jake's Gmail account once, store refresh token in OS keychain. Send via Gmail REST API. Pros: clean; we own the deliverability story. Cons: dedicated warming if cold-emailing at scale; rate limits.

**Option B: Instantly / Smartlead via API.** Built for cold email — handles warming, deliverability, rotation. Send via their REST API; ingest replies via webhook or API poll. Pros: scales to 500+/day cleanly. Cons: external dependency + monthly cost.

**Recommendation:** Option B (Instantly). Cold email at scale needs warming + rotation infrastructure we should not build ourselves. If Jake disagrees, A is straightforward.

## What "done" looks like

1. **Connect once.** Settings → Outreach → connect Instantly (API key) or Gmail (OAuth).
2. **Queue from prospect list.** From `OutreachProspectPage`, select N prospects + a sequence → "Queue for send". Each prospect gets the sequence's step-1 email, rendered through Vortex with their company name + scrape findings substituted.
3. **Sends fire on schedule.** Configurable: default `9am–5pm, prospect's local tz, 60–120s between sends, 50/day cap, M–F only`. Jake never clicks send.
4. **Replies land in a single Inbox view.** New `OutreachInboxPage` shows replies grouped by classification.
5. **Auto-classification:** Each reply gets routed through `claude -p` with a small classifier prompt: `interested / objection / not now / out-of-office / unsubscribe / unclear`.
6. **Auto-drafted response:** For `interested` and `objection`, Vortex drafts a reply pre-loaded into the prospect's thread view. Jake reviews → one click sends.
7. **Sequence pause on reply.** As soon as any reply arrives from a prospect, their sequence pauses automatically. No more cold steps go out to someone in conversation.

## Build steps

1. **Send adapter trait.**
   - `app/src-tauri/src/outreach_send.rs` — define `trait SendProvider { fn send(...); fn poll_replies(...); }`.
   - Implementations: `InstantlyProvider`, `GmailProvider`. Pick at startup based on config.
   - Stub provider for tests.

2. **Outbox queue.**
   - `vault/outreach/outbox/<prospect-id>.json` — pending sends, retry counters, next-fire time.
   - Background tick (every 30s) reads outbox, fires what's due, moves to `sent/`.

3. **Reply ingest.**
   - Instantly: webhook handler in Tauri (local-only HTTP server, OS port 0 or fixed). Or polling every 5min.
   - Gmail: poll `is:unread newer_than:5m`, filter to threads we sent into, fetch body.
   - Write each reply to `vault/outreach/replies/<prospect-id>/<timestamp>.md`.

4. **Classifier.**
   - `app/src/lib/replyClassify.ts` — calls `claude -p` with a short prompt. Returns `{ category, confidence, summary }`.
   - On `unsubscribe`: write to suppression list (`vault/outreach/suppression.json`), never email this address again.

5. **Auto-draft.**
   - For `interested` / `objection`: call Vortex with the thread context + Jake's voice. Save to `vault/outreach/drafts/<prospect-id>-<timestamp>.md`.
   - Show in `OutreachInboxPage` with an "Approve + send" button.

6. **Activity log entries.**
   - `outreach_sent · <prospect> · step <n>`
   - `outreach_reply · <prospect> · <category>`
   - `outreach_replied · <prospect>` (after Jake sends his reply)

7. **Guardrails.**
   - Hard cap: 80/day per Gmail account. Configurable for Instantly.
   - Domain throttle: max 3 prospects per same root domain per day.
   - Spam keyword scan on outbound + sequence pre-flight check.

## Open decisions

- **Send provider.** A or B. See recommendation above.
- **Inbox surface placement.** New `OutreachInboxPage` vs. an inbox tab inside `OutreachHub`. Recommend the latter.
- **Where Vortex auto-drafts run.** Live on inbox open (slow but always fresh) or as a `scheduled-agents` job at 8am for all overnight replies (fast at open time, costs `claude -p` minutes overnight). Recommend the latter.
- **Confidence threshold for auto-draft.** Only draft when classifier confidence > 0.7. Anything lower stays in a "needs review" bucket.

## Out of scope

- LinkedIn outreach. Email only for v1.
- Phone / SMS follow-up sequencing.
- A/B testing subject lines (different doc).
- Replying without Jake's review. Always human-in-the-loop on send.

## Effort + leverage

- 3–5 days.
- Throughput jump: ~10× outbound for the same Jake-hours. If conversion holds, that is the customer acquisition story for the next 6 months.
