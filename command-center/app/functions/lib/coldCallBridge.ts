import type { Env } from "./env";

// Click to dial, without a softphone of our own.
//
// GoHighLevel's LC Phone softphone cannot be embedded: app.gohighlevel.com is
// served with x-frame-options SAMEORIGIN, and the public LC Phone API is four
// number-provisioning endpoints with nothing that registers a browser as a
// device. So the call card does not try to BE a phone. It asks GoHighLevel to
// place the call, which is a thing GoHighLevel will happily do.
//
// The mechanism is one workflow with a single Call action. Dropping a contact
// into it makes GHL ring the user assigned to that contact, play a whisper, take
// a keypress, then dial the prospect and bridge the two. The call goes out on the
// agency number, gets recorded, and lands on the contact's timeline exactly as it
// does when the phone icon is pressed by hand over there.
//
// What this buys: the caller never leaves the app. What it costs: the audio comes
// out of the caller's handset rather than the browser tab, and there is a couple
// of seconds between the button and the ring, because a workflow is doing the
// work. Both were understood and accepted; the alternative was our own Twilio
// line and its bill (see docs/build-plans/cold-call-in-app-dialer.md).
//
// Everything here is pure. The endpoint does the talking; these are the rules it
// applies, kept testable because the failure modes are the whole design: a
// workflow that is missing, a workflow left in draft and a prospect with no
// number all have to say something a caller can act on mid-shift.

// The workflow the Call action lives in. Matched BY NAME rather than by id: an
// id would mean a redeploy the first time the workflow is rebuilt, and it is
// Jake who owns that workflow, not this app.
export const BRIDGE_WORKFLOW_NAME = "CC Bridge Dial";

export function bridgeWorkflowName(env: Env): string {
  return (env.AGENCY_GHL_BRIDGE_WORKFLOW ?? "").trim() || BRIDGE_WORKFLOW_NAME;
}

// The enrolment's eventStartTime, in the one shape GoHighLevel accepts.
//
// Their validator is fussier than ISO 8601 and this cost a live button.
// `new Date().toISOString()` yields "2026-08-15T20:18:39.276Z", and the
// enrolment answers 422: "The event start time must be a date and time with
// timezone offset. ex: 2021-06-23T03:30:00+01:00". The FRACTIONAL SECONDS are
// what it refuses; the same instant without them enrolled with a 201 against the
// live account on 2026-08-15.
//
// Written as +00:00 rather than the equivalent Z, because that is the shape their
// own error message documents, and a validator that already rejects milliseconds
// is one that could later reject Z too. UTC throughout: this is an instant, not a
// wall clock, and the agency timezone has no say in when "now" is.
export function ghlEventStartTime(at: Date): string {
  return `${at.toISOString().slice(0, 19)}+00:00`;
}

// A workflow as GET /workflows/ returns it. Only the three fields that decide
// anything; the endpoint never reads the rest.
export interface GhlWorkflowSummary {
  id: string;
  name: string;
  status?: string | null;
}

// Everything that can stop a dial, named so the card can say the right sentence.
export type BridgeFailure =
  | "not_configured"
  | "no_phone"
  | "no_contact"
  | "workflow_missing"
  | "workflow_draft"
  | "enroll_failed";

export type WorkflowPick =
  | { ok: true; id: string }
  | { ok: false; error: "workflow_missing" | "workflow_draft" };

// Find the bridge workflow, and refuse a draft.
//
// A draft workflow accepts the contact over the API and then does nothing at
// all, which on the phones looks exactly like a dead button: no ring, no error,
// no call. Draft is therefore its own failure and not a missing workflow, because
// the fix is one click in a different place.
//
// Published wins when a name appears twice. Duplicating a workflow in GHL leaves
// "CC Bridge Dial" next to a draft copy of it, and picking the copy would be the
// same silent nothing.
export function pickBridgeWorkflow(
  workflows: GhlWorkflowSummary[],
  name: string,
): WorkflowPick {
  const wanted = name.trim().toLowerCase();
  const matches = workflows.filter((w) => (w.name ?? "").trim().toLowerCase() === wanted);
  if (matches.length === 0) return { ok: false, error: "workflow_missing" };
  const live = matches.find((w) => (w.status ?? "").trim().toLowerCase() === "published");
  if (!live) return { ok: false, error: "workflow_draft" };
  return { ok: true, id: live.id };
}

// What the caller reads on the card. Written to be actionable at 10am with a
// list in front of them, so each one says where to go, not what went wrong.
export function bridgeFailureMessage(error: BridgeFailure, workflow: string): string {
  switch (error) {
    case "not_configured":
      return "The agency GoHighLevel account is not connected, so the call cannot be placed.";
    case "no_phone":
      return "This prospect has no phone number on file.";
    case "no_contact":
      return "Could not create this prospect in GoHighLevel, so there is nobody to dial.";
    case "workflow_missing":
      return `No workflow named "${workflow}" in GoHighLevel. Build it, or dial from this device below.`;
    case "workflow_draft":
      return `The "${workflow}" workflow is still a draft, so it will not run. Publish it in GoHighLevel.`;
    case "enroll_failed":
      return "GoHighLevel refused the call. Dial from this device below.";
  }
}

// ---------------------------------------------------------------------------
// Reading back what the call became.
//
// GoHighLevel writes the call onto the contact's conversation as a TYPE_CALL
// message carrying meta.call.duration and meta.call.status, plus altId, which is
// the Twilio CallSid. That is enough to stamp a dial row with how long the call
// actually lasted, which is the number nobody has ever had for a cold call here.
//
// Read on the outcome press rather than pushed by a webhook, so it needs nothing
// built in GHL beyond the one workflow.

export interface GhlCallMessage {
  id: string;
  direction?: string | null;
  status?: string | null;
  messageType?: string | null;
  dateAdded?: string | null;
  // Twilio's own CallSid. Kept because it is the only id that ties our row to
  // the recording if anybody ever has to go and find it.
  altId?: string | null;
  meta?: { call?: { duration?: number | null; status?: string | null } | null } | null;
}

export interface CallStamp {
  callMessageId: string;
  callSid: string | null;
  callStatus: string | null;
  durationSeconds: number | null;
}

// The newest outbound call on this contact, optionally no older than `since`.
//
// `since` is the moment the caller pressed the button. Without it, a prospect
// called last Tuesday would stamp today's dial with last Tuesday's duration,
// which is worse than leaving it blank: a wrong number here is one somebody
// would report on.
// The two names GoHighLevel gives a call on the timeline.
//
// A call dialled by hand over there is TYPE_CALL. A call placed BY A WORKFLOW,
// which is every call this app makes, is TYPE_CAMPAIGN_CALL. Confirmed against
// the live agency account on 2026-08-15: a bridged dial came back as
// TYPE_CAMPAIGN_CALL, source "workflow". Matching only TYPE_CALL meant the
// read-back never once recognised our own calls, so every dial row kept a null
// duration and the feature looked like it simply did not work.
export const CALL_MESSAGE_TYPES = ["TYPE_CALL", "TYPE_CAMPAIGN_CALL"] as const;

export function latestOutboundCall(
  messages: GhlCallMessage[],
  since?: number,
): GhlCallMessage | null {
  let best: GhlCallMessage | null = null;
  let bestAt = -Infinity;
  for (const m of messages) {
    if (!CALL_MESSAGE_TYPES.includes((m.messageType ?? "") as (typeof CALL_MESSAGE_TYPES)[number]))
      continue;
    if ((m.direction ?? "") !== "outbound") continue;
    const at = Date.parse(m.dateAdded ?? "");
    if (!Number.isFinite(at)) continue;
    if (since !== undefined && at < since) continue;
    if (at > bestAt) {
      best = m;
      bestAt = at;
    }
  }
  return best;
}

// A duration of null is normal and not an error: it is what an unanswered call
// looks like, and it is also what an answered one looks like for the half minute
// GoHighLevel takes to finalise the message. Recorded as null either way rather
// than guessed at.
export function callStamp(message: GhlCallMessage): CallStamp {
  const raw = message.meta?.call?.duration;
  const duration = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  return {
    callMessageId: message.id,
    callSid: (message.altId ?? "").trim() || null,
    callStatus: (message.meta?.call?.status ?? message.status ?? "").trim() || null,
    durationSeconds: duration,
  };
}
