# Cold Call: dialing from inside the app

Goal: a caller clicks a number in the Cold Call queue and the call happens, with
no second tab, no popup and no re-login. Duration and recording come back and
land on the dial row the tracker already counts.

## What was asked for, and why it cannot be built

The brief was to embed GoHighLevel's LC Phone softphone in the cold call suite.
Three checks, run 2026-08-14, say that specific thing is closed:

1. **GoHighLevel refuses to be framed.** `curl -I https://app.gohighlevel.com/`
   returns `x-frame-options: SAMEORIGIN`. An iframe of the GHL app inside
   app.hauckmarketing.com renders nothing, and a draggable window does not change
   that: the header is about the origin, not the chrome around it.
2. **There is no LC Phone WebRTC handle to borrow.** The public LC Phone API is
   four endpoints, all number provisioning: list pools, search purchasable
   numbers, buy a number, list active numbers. No call placement, no Twilio voice
   access token, nothing that registers a browser as a device.
3. **The OAuth token is the wrong key anyway.** Our marketplace app holds an API
   bearer for the sub-account. The softphone in GHL registers against their
   logged-in app session, a different credential we are never issued. A stored
   API token cannot stand in for it.

So the honest position: the LC Phone softphone runs in GHL's own tab or GHL's own
mobile app, and nowhere else. Anything that appears to embed it is header
stripping in a browser extension, which breaks on their next deploy and takes the
whole calling operation down with it when it does. Not proposed here.

What follows is two routes that reach the actual goal.

## Route A: our own softphone, in the browser, inside the call card

Real WebRTC in the CC tab using the Twilio Voice JS SDK. Click the number, the
call connects in the page, mute and hang up are buttons on the card.

### Files

| File | Change |
|---|---|
| `functions/lib/twilioVoice.ts` (new) | Pure: mint the Voice access token JWT (HS256 via WebCrypto, no node SDK, Workers-safe), build the outbound TwiML, verify the `X-Twilio-Signature` on callbacks, map a status callback to a dial patch. |
| `functions/lib/twilioVoice.test.ts` (new) | Token claims and expiry, TwiML shape, signature accept/reject, status to patch. |
| `functions/api/admin/cold-call/voice/token.ts` (new) | GET, admin session gated, returns a 1 hour Voice token with an identity of the signed-in caller. |
| `functions/api/admin/cold-call/voice/twiml.ts` (new) | POST from Twilio. `<Dial callerId={AGENCY_NUMBER} record="record-from-answer-dual">` to the prospect. Signature checked, fails closed. |
| `functions/api/admin/cold-call/voice/status.ts` (new) | POST from Twilio. Writes `call_sid`, `duration_seconds`, `recording_url` onto the dial row for this call. |
| `functions/api/admin/cold-call/dials.ts` | Return the new `call_sid` on create so the client can hand it to the outcome buttons. |
| `src/lib/softphone.ts` (new) | Device lifecycle: fetch token, register once per shift, refresh before expiry, connect, mute, hang up. One state machine, unit tested. |
| `src/hooks/useSoftphone.ts` (new) | React surface over the above. Registers when the workspace mounts, not per prospect. |
| `src/components/admin/acquisition/Softphone.tsx` (new) | The control that replaces the "Dial in GoHighLevel" button: idle, ringing, connected with a live timer, mute, hang up. |
| `src/components/admin/acquisition/CallWorkspace.tsx` | `DialRow` renders `Softphone` when the connection is live. The `tel:` line stays as the fallback for a caller on their own handset. |
| `supabase/migrations/0112_cold_call_voice.sql` (new) | `cold_call_dials`: add `call_sid text`, `duration_seconds int`, `recording_url text`, all nullable. Additive, nothing existing moves. |
| `src/lib/connectionRegistry.ts` | New `twilio-voice` connection: credentials, the surfaces that go dark, remediation. |
| `docs/connections/cold-call-dialer.md` (new) | The wiring doc, same shape as the others. |

### Secrets (Doppler, mirrored to Cloudflare)

`TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`,
`TWILIO_TWIML_APP_SID`, `TWILIO_CALLER_ID`.

### Two things to decide before this ships

- **The number the prospect sees.** Either verify the existing LC Phone number as
  a Twilio outbound caller ID (Twilio calls that number once with a code, GHL
  answers it, done) so nothing on the prospect's screen changes, or buy a Twilio
  number and accept a second one.
- **Getting the call back into GHL.** Logging the call onto the contact needs
  `POST /conversations/messages/outbound`, which needs the
  `conversations/message.write` scope. The app does not carry it, GHL locks scopes
  once a version is published, so it means a new app version and a reinstall.
  Phase two, not a blocker: the dial row in our own database is what the tracker
  and the scoreboard count.

### Cost

About $1.15 a month for a number if we buy one, $0.014 a minute outbound US,
$0.0025 a minute recorded. A hundred dials a day at two minutes is roughly $70 a
month.

## Route B: click to dial through GoHighLevel, no new telephony

**Built and shipped 2026-08-14.** Wiring, workflow steps and what it does not do
are in `docs/connections/cold-call-dialer.md`, which is the live record. What
follows is the plan it was built from.

GHL's workflow **Call** action rings the assigned user first, plays a whisper,
takes a keypress, then dials the contact and bridges the two. That is a
click to dial button we can fire from CC without owning any telephony: the caller
never leaves the app, LC Phone still places the call from the agency number, and
the recording lands in the contact's conversation the way it does today.

### Files

| File | Change |
|---|---|
| `functions/api/admin/cold-call/bridge.ts` (new) | POST `{ leadId }`. Resolves the prospect's GHL contact, calls `POST /contacts/:contactId/workflow/:workflowId` on the bridge workflow, returns the dial row id. Uses `contacts.write`, which the app already has, so no reinstall. |
| `functions/lib/coldCallBridge.ts` + test (new) | Pure: pick the workflow id, shape the call, map the failure cases (no contact, no number, workflow missing) to messages a caller can act on. |
| `src/components/admin/acquisition/CallWorkspace.tsx` | `DialRow` becomes a **Call** button plus a "your phone is ringing" state. The `tel:` line stays. |
| `src/hooks/useColdCall.ts` | `useBridgeDial`, alongside the existing dial logging. |
| `functions/api/webhook.ts` | Handle the Call Status event: write `duration_seconds` and `recording_url` onto the open dial row for that contact. |
| `supabase/migrations/0112_cold_call_voice.sql` | Same additive columns as Route A. |
| `docs/connections/cold-call-dialer.md` (new) | Including the one workflow Jake builds by hand. |

### Jake's one manual step

A workflow named `CC Bridge Dial`: trigger "Contact added to workflow", single
Call action, recipient = assigned user, whisper on, keypress on, recording on.
Plus a Call Status trigger workflow posting to
`https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>`.

### The trade

Audio is on the caller's handset or the GHL mobile app, not in the browser tab.
The workflow never leaves CC, the sound does. Nothing new to buy, nothing new to
maintain, and it can ship this week.

## Route C: put the suite inside GHL instead

GHL happily frames us: a Custom Page or menu link renders app.hauckmarketing.com
in their shell, next to their softphone. One screen, one login, zero build.
It is not recommended, because the caller then lives in GHL's chrome and clicking
a number in our page still cannot drive their dialer. There is no documented
message channel into it. This is a same-screen answer, not a click to dial one.

## Recommendation

Ship **Route B** first, because it costs nothing, needs no new scope and answers
the real complaint, which is the forty tabs. Then take **Route A** if the browser
softphone is worth the telephony bill and the caller ID verification, and keep B
as the fallback when the browser leg fails.
