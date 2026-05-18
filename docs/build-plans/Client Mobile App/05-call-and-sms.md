# Section 05: Click-to-call + SMS thread

## Goal

Make the lead detail screen actually useful for a tradesperson in the field. End state: tap the phone icon, the iPhone dialer opens with the lead's number pre-filled. Open the SMS tab on a lead, see the GHL conversation thread inline, type a reply, send → message goes out via GHL and shows up in the thread within 2 seconds.

Estimated time: ~1 hour.

## Depends on

Section 04 (lead detail screen rendering real GHL data, conversation thread placeholder in place).

## Files created / modified

```
client-dashboard/
  functions/api/leads/[id]/messages.ts        (new: GET thread + POST send via GHL Conversations API)
  src/
    hooks/
      useConversation.ts                      (new: useQuery around messages GET, polls every 10s)
      useSendMessage.ts                       (new: useMutation around messages POST)
    components/
      ConversationThread.tsx                  (new: scrollable message list, inbound/outbound bubbles)
      MessageComposer.tsx                     (new: text input + send button, 1600 char limit)
      CallButton.tsx                          (new: tel: link with formatted display)
    routes/
      LeadDetail.tsx                          (modified: mount ConversationThread + MessageComposer, wire CallButton)
```

## Steps

1. **Pages Function for messages (15 min)**
   - `functions/api/leads/[id]/messages.ts`:
     - `GET` → calls GHL `GET /conversations/search?contactId=:id`, then `GET /conversations/:convId/messages?limit=50` for the most recent conversation. Returns `{ messages: [{ id, direction, body, sentAt, status }], conversationId }`. If no conversation exists yet, returns `{ messages: [], conversationId: null }`.
     - `POST` body `{ body }` → calls GHL `POST /conversations/messages` with `type: 'SMS'`, `contactId`, `message: body`. Creates a conversation on the fly if one doesn't exist. Returns the new message record.
   - Both paths reuse the JWT-verify + tenant-token-lookup helpers from section 03.
   - Activity log: insert a row into `activity_log` on every send (`action: 'sms_send'`, `lead_id`, `payload: { body }`).

2. **useConversation hook (10 min)**
   - `useConversation(leadId)` → wraps `GET /api/leads/:id/messages`.
   - `refetchInterval: 10_000` so inbound replies appear without manual refresh while the screen is open.
   - `staleTime: 0` to ensure poll fires.

3. **useSendMessage hook (10 min)**
   - `useSendMessage(leadId)` → wraps `POST /api/leads/:id/messages`.
   - Optimistic insert: append a temp message with `status: 'sending'` to the cached thread. On success replace with the server record. On error mark `status: 'failed'` and surface a retry button on the bubble.
   - Invalidate `useLead` (so the lead's "last activity" updates).

4. **ConversationThread (15 min)**
   - Renders messages oldest → newest, autoscrolls to bottom on mount and on new message.
   - Inbound bubble: light gray, left-aligned. Outbound: brand color, right-aligned. Status icon (sending / sent / failed) under outbound bubbles.
   - Date separators between days. Compact time format (`3:42 PM`) under each bubble.
   - Empty state copy: "No messages yet. Send the first one below."

5. **MessageComposer (10 min)**
   - Auto-expanding textarea, max 4 rows.
   - Send button disabled when empty or while `useSendMessage.isPending`.
   - Char counter visible once you cross 1400 (warn before GHL's 1600 SMS limit).
   - Submit on Enter (Shift+Enter for newline). On mobile, the keyboard's Send button works the same.

6. **CallButton (5 min)**
   - `<a href={"tel:" + e164(lead.phone)}>` with phone icon + formatted display (`(555) 123-4567`).
   - 44px tap target. No JS — letting the OS handle `tel:` is the most reliable behavior.
   - Hide the button if the lead has no phone number.

7. **Wire into LeadDetail (5 min)**
   - Replace the placeholder conversation container from section 04 with `<ConversationThread leadId={id} />` and `<MessageComposer leadId={id} />`.
   - CallButton sits in the header next to the lead name.

8. **Local test (10 min)**
   - `pnpm dev`. Open a Willis lead with a real phone number and existing GHL conversation history.
   - Thread loads. Tap call button → iOS dialer opens with the number.
   - Type a message, send → appears in thread immediately as "sending", flips to "sent" within ~1s.
   - Check GHL's Conversations panel on laptop — message is there, marked outbound.
   - Have someone reply to the SMS from a real phone (or simulate via GHL UI) → the inbound message appears in the thread within 10s without manual refresh.

## Acceptance criteria

- Tap-to-call opens the dialer with E.164-formatted number.
- Conversation thread loads in under 1s for leads with under 50 messages.
- Outbound SMS appears optimistically, confirms within 2s.
- Polling picks up inbound replies within 10s.
- Send failure shows a retry affordance on the message bubble.
- `pnpm typecheck` clean.

## Stop condition

Commit when send/receive round-trips against real Willis numbers.

**Commit message:** `client-dashboard: tap-to-call + inline SMS thread (section 05)`

## Notes

- We do not implement a separate inbox/conversations list screen today. SMS lives on the lead detail only. A standalone Conversations tab is Tier 2.
- Polling at 10s is wasteful compared to GHL's webhook approach, but webhooks-into-the-app for inbound SMS is overkill for one client. If Willis hits heavy SMS volume, swap to a webhook + Supabase realtime in a future pass.
- The composer's 1600 char limit matches GHL's hard limit. Above that, GHL chunks the message and counts each part separately. We warn at 1400 so reps know they're getting close.
- E.164 normalization (`+15551234567`) lives in `src/lib/phone.ts`. Reuse for both the tel link and any future SMS targets.
