# 11: Two-Way Messaging (multi-channel completion)

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

## Objective

Complete the messaging feature. SMS send already works. This doc adds the rest: email replies,
the other inbound channels GHL routes (Facebook, Instagram, Google Business, WhatsApp), correct
channel selection, and delivery/read status, so a conversation in the app behaves like the real
inbox rather than an SMS-only window.

## Why it matters

Messaging is the highest daily-use surface in the app, and it is already half-built, which makes
finishing it cheaper than it looks. The gap is real, though: if a lead came in over Instagram and
the client taps reply, the app currently sends SMS, which either fails or texts the wrong channel.
That is a credibility bug in front of the client's customers.

## Dependencies

- None hard. Extends shipped code.
- Pairs with 14 (notifications): inbound messages are the primary thing a client wants pushed.

## Current state (already built)

Send works for SMS. `functions/api/conversations/[contactId]/sms.ts` posts to GHL:

```ts
// functions/api/conversations/[contactId]/sms.ts (current, SMS only)
const sent = await ghlJson<SendResponse>(
  { token: t.ghl_token, locationId: t.ghl_location_id },
  `/conversations/messages`,
  { method: "POST", body: JSON.stringify({ type: "SMS", contactId, message: body.body }) },
);
```

The thread read path (`functions/api/conversations/[contactId]/messages.ts`) fetches messages and
already filters system/activity messages. There is a `MessageComposer` and a parallel
`...ByContact` set of components and routes. The same SMS-only send exists under
`functions/api/leads/[id]/sms.ts`.

So the read side is multi-type aware; the **send** side is hardcoded to SMS, and there is no
channel picker in the composer.

## Target state

One send endpoint that accepts a channel and routes correctly:

- `POST /conversations/messages` with `type: "SMS"`   and `message`
- `POST /conversations/messages` with `type: "Email"` and `html`, `subject` (and `emailFrom` if
  the location requires it)
- `type: "FB" | "IG" | "GMB" | "WhatsApp" | "Live_Chat" | "Custom"` for the social/DM channels,
  each with `message`
- `GET  /conversations/messages/{messageId}` to read delivery status if you surface it

The composer gains a channel selector that defaults to the channel of the **last inbound
message** in the thread (reply on the channel they contacted you on), with manual override to any
channel the contact is reachable on.

## Step-by-step

### 1. Generalise the send route

Rename the intent of `sms.ts` to a channel-aware `send`. Either add a new
`functions/api/conversations/[contactId]/send.ts` and deprecate `sms.ts`, or widen `sms.ts` to
accept `{ channel, body, subject? }`. Map `channel` to GHL's `type` and the right body field:

```ts
function buildMessage(channel: string, body: string, subject?: string) {
  if (channel === "Email") return { type: "Email", subject: subject ?? "", html: body };
  return { type: channel, message: body }; // SMS, FB, IG, GMB, WhatsApp, ...
}
```

Validate `channel` against an allow-list. Reject email with no subject if the location requires
one (confirm against a live send).

### 2. Detect the default reply channel

In the messages route, the last inbound message already carries a `type`. Return a
`defaultChannel` and the set of `availableChannels` (channels seen in the thread, plus SMS/Email
if the contact has a phone/email) alongside the messages, so the composer can pre-select.

### 3. Composer channel picker

Update `MessageComposer` (and the `...ByContact` variant) to show the selected channel and allow
switching. For Email, reveal a subject field. Keep SMS the zero-friction default for SMS threads.
Render each message in the thread with a small channel badge so a mixed thread is legible.

### 4. Delivery status (optional but cheap)

If you surface message status, poll `GET /conversations/messages/{messageId}` once after send (or
read it from the next thread refresh) and show sent / delivered / failed. Failed sends must be
visible, not silent.

### 5. Reconcile the two composer paths

There are two parallel implementations (`MessageComposer` vs `MessageComposerByContact`, and the
leads vs conversations send routes). Pick one as canonical and have the other call it, or at least
make both channel-aware. Do not fix SMS-to-multichannel in one path and leave the other on SMS.

## Testing

In the test account, on threads of different origins:

1. Reply to an SMS thread; defaults to SMS; arrives as SMS.
2. Reply to a thread whose last inbound was Email; composer defaults to Email; subject required;
   arrives as email.
3. If the test location has a connected FB/IG channel, reply on it and confirm delivery.
4. Force a failure (e.g. contact with no email, Email channel) and confirm a visible error.
5. Both the leads-detail composer and the conversations composer behave identically.

## Acceptance criteria

- [ ] Replies default to the channel of the last inbound message in the thread.
- [ ] Email send works with a subject; SMS and available social channels send correctly.
- [ ] The channel is selectable and the choice is obvious in the UI.
- [ ] Messages in a thread show which channel they used.
- [ ] Failed sends surface an error; they are never swallowed.
- [ ] The leads and conversations send paths share channel-aware logic (no SMS-only path left).

## Rollback

The new send route is additive; revert the composer changes and point sends back at the original
`sms.ts`. Because the original SMS path is preserved until the new one is verified, rollback is a
composer revert plus a one-line endpoint swap.
