# Cold Call dialer (the Call button): connections

The Call button on the cold call card asks GoHighLevel to place the call. It rings
the caller's own phone, plays a whisper, takes a keypress, then dials the prospect
from the agency number and bridges the two. The app never leaves the screen.

Status: ⚠️ built and deployed, one workflow pending Jake.
Legend: ❌ not wired · ⚠️ partial · ✅ live.

## Why it is built this way

GoHighLevel's LC Phone softphone cannot be embedded here. Checked, not assumed:

- `curl -I https://app.gohighlevel.com/` returns `x-frame-options: SAMEORIGIN`, so
  no iframe of any GHL page renders, and there is no narrower URL for a single
  contact's dial control: every dial button they have lives in that one document.
- The public LC Phone API is four endpoints and all four are number provisioning.
  Nothing places a call, and nothing mints a token that registers a browser as a
  WebRTC device.
- Our credential is a Private Integration Token, an API key. The softphone
  registers against a logged-in GHL app session, which we are never issued.

The workflow Call action is the only route into LC Phone a third party can reach,
and enrolling a contact is the only way in. The alternative was our own Twilio
line, costed and set aside in `docs/build-plans/cold-call-in-app-dialer.md`.

## The one thing Jake builds (five minutes, no code)

⚠️ **A workflow named exactly `CC Bridge Dial`, published.**

1. Automation > Workflows > Create Workflow > Start from scratch.
2. Name it `CC Bridge Dial`.
3. No trigger is needed: the app injects the contact over the API. If GHL refuses
   to publish without one, add trigger **Contact Tag** with the tag
   `cc bridge dial`, which nothing ever applies, so it stays inert.
4. Add one action: **Call**.
   - Whisper message: something like "Cold call, press 1 to connect".
   - Require keypress: **on**. Without it, voicemail on the caller's phone can
     answer and the prospect gets bridged to an answerphone.
   - Call timeout: 30 seconds.
5. **Publish it.** A draft accepts the contact over the API and then does nothing
   at all, which on the phones looks exactly like a dead button. The app checks
   for this and says so by name rather than letting it happen silently.

Rename it freely: set `AGENCY_GHL_BRIDGE_WORKFLOW` to the new name and the app
follows, no deploy.

⚠️ **Check call recording is on** for outbound calls (Settings > Phone Numbers >
Advanced Settings). The duration read-back does not depend on it, but the
recording on the contact does.

## Who the call rings

✅ The Call action rings **the user assigned to the contact**, falling back to the
company phone number when nobody is assigned. There is no way to pass a recipient
with the enrolment, so the assignment IS the routing: the endpoint sets
`assignedTo` on the contact before enrolling it, to `AGENCY_GHL_USER_ID`
(defaults to Jake, `kQawsNSJbC7UApa6f4Am`, whose GHL user record carries the
number that will actually ring).

A second caller means a second GHL user and a per-caller mapping. Today the
account is one person, so it is one env var.

## Secrets / env

- ✅ `AGENCY_GHL_LOCATION_ID`, `AGENCY_GHL_TOKEN`: already set, shared with the
  rest of the cold call suite. Absent, the button says the account is not
  connected rather than failing quietly.
- ✅ `AGENCY_GHL_USER_ID`: optional, defaults to Jake.
- ✅ `AGENCY_GHL_BRIDGE_WORKFLOW`: optional, defaults to `CC Bridge Dial`.

Token scopes needed, all confirmed working against the live agency account on
2026-08-14: contacts read + write (upsert and assign), workflows read (find the
workflow by name), conversations read (the duration read-back).

## Endpoints

- ✅ `POST /api/admin/cold-call/bridge` `{ leadId }`. Upserts the contact, assigns
  it, finds the published workflow by name, enrols the contact. Answers
  `{ ok: true, startedAt }` or `{ ok: false, error, message }` with a sentence the
  card renders as-is. Never throws for an account state: a missing workflow, a
  draft workflow and a prospect with no number are all answers, not errors.
- ✅ `POST /api/admin/cold-call/dials` now accepts `bridgedAt`. When present, the
  outcome press reads the prospect's newest outbound call off their GHL
  conversation and stamps the dial row with its duration, status and CallSid
  (0112). Best effort and off the response path: the caller is already on the next
  prospect.

## What it does not do

- The audio is on the caller's handset, not in the browser. Placing the call is
  what moved into the app, not the call itself.
- There are a couple of seconds between the press and the ring, because a workflow
  is doing the work.
- A duration of null is normal: it is what an unanswered call reads as, and also
  what an answered one reads as for the half minute GoHighLevel takes to finalise
  the message. The tracker's counts do not depend on it (they are still derived
  from spoke/pitched, 0052), so a null costs nothing.
