# Cold Call dialer (the Call button): connections

The Call button on the cold call card asks GoHighLevel to place the call. It rings
the caller's own phone and, the moment they answer, dials the prospect from the
agency number and bridges the two. The app never leaves the screen.

Status: ✅ live. Built, deployed and wired 2026-08-14. Workflow published, migration
0112 applied. Proven end to end on 2026-08-15 with a test call to an unroutable
555 number: the workflow ran, rang the assigned user and dialled out from the 313
local number. Still awaiting a real ANSWERED call to confirm a non-null duration.

### What the 2026-08-15 test proved, and the two bugs it found

The chain itself is sound. `GET /workflows/` finds the published workflow, the
`assignedTo` PUT returns 200, and the enrolment POST returns **201**. GoHighLevel
wrote the call onto the contact as `from +13133704923` (the local number, not the
toll-free one, which settles the open question above) with `userId` Jake and
`source: workflow`.

Three things were wrong and are now fixed:

0. **The enrolment was refused outright, in prod, for every call.** GoHighLevel
   validates `eventStartTime` more strictly than ISO 8601:
   `new Date().toISOString()` gives `2026-08-15T20:18:39.276Z` and the enrolment
   answers **422 "The event start time must be a date and time with timezone
   offset. ex: 2021-06-23T03:30:00+01:00"**. The FRACTIONAL SECONDS are the
   objection. The manual test on 2026-08-15 passed only because `date -u` happens
   to omit them, which is exactly why the bug survived that test. Now formatted by
   `ghlEventStartTime()` as `2026-08-15T20:19:40+00:00`, verified 201 live.

1. **The duration read-back never matched our own calls.** A call dialled by hand
   in GoHighLevel is `TYPE_CALL`, but a call placed BY A WORKFLOW, which is every
   call this app makes, is **`TYPE_CAMPAIGN_CALL`**. `latestOutboundCall()`
   matched only the former, so it recognised nothing and every dial row kept a
   null duration, status and CallSid. Both types are now accepted.
2. **A failed contact sync was swallowed.** `upsertAgencyContact` returns the id
   already on file when the upsert fails, and the endpoint checked only that an
   id came back, never `ok`. A contact that failed to sync therefore proceeded
   silently, and if the enrolment then failed the caller read "GoHighLevel refused
   the call" with nothing after it. The reason is now carried into the failure
   detail, and the card renders it under the message.

Note the live message carried no `meta.call` object at all, only `status` and
`altId`. `callStamp` already falls back to `status` and records a null duration,
which is the right answer for a call that never connected. Whether `meta.call`
appears on an ANSWERED call is the one thing still unproven.
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

## The workflow (built by hand 2026-08-14)

✅ **`CC Bridge Dial`, published**, id `cffad8d7-59f2-402a-8fe2-08730ae045a4`.

Its settings live in GoHighLevel and can be neither read nor written from here.
Re-verified 2026-08-15: `GET /workflows/{id}` and `PUT /workflows/{id}` are both
**404, the endpoints do not exist**. The public API lists workflows and nothing
more, and reaching a step needs the internal API, whose Firebase token is expired.
Every setting below is therefore changed by hand in the GoHighLevel UI. So this is the intended configuration rather than
a reading of the live one.

- **Connect call after keypress: off.** It exists to prove a human answered, which
  matters for a power dialer where calls arrive unpredictably. Here the caller
  pressed Call two seconds earlier and is holding the phone, so it charges an
  action per call to guard a case they created themselves. The residual risk is
  the caller's own voicemail answering and the prospect being bridged to it, which
  voicemail detect covers imperfectly.
- **Disable voicemail detect: off**, meaning detection is ON. It is the only thing
  standing between a slow pickup and a prospect hearing a voicemail greeting.
- **Call timeout: 30s.** Ring time before GoHighLevel gives up. GHL's wording does
  not say whether it governs only the leg to the caller or the leg to the prospect
  too. If both, 30 gives up at about the moment a mobile would roll to voicemail,
  which is the right place to stop.
- **Whisper: none. Leave the field EMPTY** (2026-08-15, Jake's call). It used to
  say "Cold call, connecting you now", and that sentence is pure delay: the caller
  pressed the button themselves and knows what the call is, so playing it to them
  only holds the bridge open while the prospect's phone is already ringing, and a
  prospect who answers during it hears silence. Answer the handset and the
  prospect is simply there.

  If GoHighLevel refuses to save an empty whisper, put a single space in it rather
  than reinstating a sentence.

Rebuild it from these steps if it is ever lost:

1. Automation > Workflows > Create Workflow > Start from scratch.
2. Name it `CC Bridge Dial`.
3. No trigger is needed: the app injects the contact over the API. If GHL refuses
   to publish without one, add trigger **Contact Tag** with the tag
   `cc bridge dial`, which nothing ever applies, so it stays inert.
4. Add one action: **Call**, configured as above.
5. **Publish it.** A draft accepts the contact over the API and then does nothing
   at all, which on the phones looks exactly like a dead button. The app checks
   for this and says so by name rather than letting it happen silently.

Rename it freely: set `AGENCY_GHL_BRIDGE_WORKFLOW` to the new name and the app
follows, no deploy.

⚠️ **Check call recording is on** for outbound calls (Settings > Phone Numbers >
Advanced Settings). The duration read-back does not depend on it, but the
recording on the contact does.

## The numbers on this account

Two, read from `GET /phone-system/numbers?locationId=` on 2026-08-14:

- `+1 313-370-4923` — Local Number. The line inbound calls arrive on, and the one
  a cold call should go out from: a local caller ID gets answered.
- `+1 855-612-2433` — Toll Free Number.

Which one the Call action dials FROM is the location's default outbound number,
set in GoHighLevel and not readable here. Worth confirming it is the 313: a
toll-free caller ID on a cold call is close to a guaranteed no-answer.

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
