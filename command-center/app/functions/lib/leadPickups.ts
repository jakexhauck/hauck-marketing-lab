// Pickups from real calls, not from where a card was dragged.
//
// The old pickup counted a lead whose opportunity sat in a "talked to them"
// stage, so a setter who forgot to move the card made the lead look unanswered.
// This reads the calls themselves off the client's GoHighLevel number:
//
//   called     the lead has at least one OUTBOUND call
//   picked up  an outbound call reached a person (Claude reading the
//              transcript, or 30+ seconds on the line when there is none),
//              OR the lead texted in, OR the lead called in and was answered
//
// Pickup % is picked up ÷ (called or reached out), per Jake 2026-10-09: out of
// the leads we actually tried, how many we got. A lead who texted in before
// anyone dialled counts on both sides, since contact was made.
//
// Pure: the sync (leadPickupSync.ts) and the tracker both call into here.

export const PICKUP_MIN_SECONDS = 30;

// A completed call younger than this waits for its transcript before falling
// back to duration. GoHighLevel transcribes after the call ends, not during.
export const TRANSCRIPT_WAIT_MS = 30 * 60_000;

export interface ExportCall {
  id?: string;
  contactId?: string;
  direction?: string;
  status?: string;
  dateAdded?: string;
  messageType?: string;
  meta?: { call?: { duration?: number | null; status?: string } };
}

export interface TouchRow {
  ghl_message_id: string;
  ghl_contact_id: string;
  kind: "call" | "sms";
  direction: "inbound" | "outbound";
  status: string;
  duration_sec: number | null;
  occurred_at: string;
  picked_up: boolean | null;
  method: "ai" | "duration" | "status" | "inbound" | null;
}

function dir(v: unknown): "inbound" | "outbound" | null {
  return v === "inbound" || v === "outbound" ? v : null;
}

// One export message as a touch, with every verdict that needs no transcript
// already decided. Returns null for anything that is not about a lead.
export function toTouch(m: ExportCall, kind: "call" | "sms"): TouchRow | null {
  const id = (m.id ?? "").trim();
  const contactId = (m.contactId ?? "").trim();
  const direction = dir(m.direction);
  if (!id || !contactId || !direction || !m.dateAdded) return null;
  const status = String(m.status ?? m.meta?.call?.status ?? "").toLowerCase();
  const duration = typeof m.meta?.call?.duration === "number" ? m.meta.call.duration : null;

  const row: TouchRow = {
    ghl_message_id: id,
    ghl_contact_id: contactId,
    kind,
    direction,
    status,
    duration_sec: duration,
    occurred_at: m.dateAdded,
    picked_up: null,
    method: null,
  };

  if (kind === "sms") {
    // Our own outbound texts say nothing about the lead, so only replies count.
    if (direction === "outbound") return null;
    return { ...row, picked_up: true, method: "inbound" };
  }

  if (direction === "inbound") {
    // They rang us. Answered is contact; a missed inbound call is still kept so
    // the lead is not reported as never called, but it is not a pickup.
    return status === "completed"
      ? { ...row, picked_up: true, method: "inbound" }
      : { ...row, picked_up: false, method: "status" };
  }

  // Outbound that never connected: no transcript is coming, nothing to wait for.
  if (status !== "completed") return { ...row, picked_up: false, method: "status" };
  return row;
}

// The fallback for a completed outbound call with no transcript.
export function durationVerdict(durationSec: number | null): boolean {
  return (durationSec ?? 0) >= PICKUP_MIN_SECONDS;
}

// GoHighLevel's transcription comes back as sentence objects. Flattened to
// "Speaker N: text" lines; anything unexpected collapses to "" rather than
// throwing, and an empty transcript means "use duration".
export function transcriptText(body: unknown): string {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { transcription?: unknown })?.transcription)
      ? (body as { transcription: unknown[] }).transcription
      : [];
  const lines: string[] = [];
  for (const s of list) {
    const text = String((s as { transcript?: unknown })?.transcript ?? "").trim();
    if (!text) continue;
    const ch = (s as { mediaChannel?: unknown })?.mediaChannel;
    // Which channel is which side is not documented, so the label stays neutral.
    lines.push(typeof ch === "number" ? `Speaker ${ch}: ${text}` : text);
  }
  return lines.join("\n").slice(0, 6000);
}

export const PICKUP_SYSTEM =
  "You read the transcript of one outbound sales call from a home services " +
  "business to a lead. Decide whether a live human answered and spoke with " +
  "the caller. Voicemail greetings, carrier messages, automated menus, call " +
  "screening robots and silence are NOT a pickup. A real person saying even " +
  "a few words (including hanging up after hello) IS a pickup.";

export const PICKUP_SCHEMA = {
  type: "object",
  properties: { picked_up: { type: "boolean" } },
  required: ["picked_up"],
  additionalProperties: false,
};

export function isPickupAnswer(v: unknown): v is { picked_up: boolean } {
  return typeof (v as { picked_up?: unknown })?.picked_up === "boolean";
}

export interface ContactTouches {
  called: boolean;
  pickedUp: boolean;
}

export function summarizeTouches(
  rows: Pick<TouchRow, "ghl_contact_id" | "kind" | "direction" | "picked_up">[],
): Map<string, ContactTouches> {
  const out = new Map<string, ContactTouches>();
  for (const r of rows) {
    const t = out.get(r.ghl_contact_id) ?? { called: false, pickedUp: false };
    if (r.kind === "call" && r.direction === "outbound") t.called = true;
    // An inbound text or answered inbound call is reaching out: it puts the lead
    // in the denominator too, so it can never push Pickup % above 100.
    if (r.direction === "inbound" && r.picked_up) {
      t.called = true;
      t.pickedUp = true;
    }
    if (r.direction === "outbound" && r.picked_up) t.pickedUp = true;
    out.set(r.ghl_contact_id, t);
  }
  return out;
}

export interface PickupCounts {
  called: number;
  pickups: number;
  notCalled: number;
}

export function countPickups(
  contactIds: Iterable<string>,
  touches: ReadonlyMap<string, ContactTouches>,
): PickupCounts {
  let called = 0;
  let pickups = 0;
  let notCalled = 0;
  for (const id of contactIds) {
    const t = touches.get(id);
    if (t?.called) called += 1;
    else notCalled += 1;
    if (t?.pickedUp) pickups += 1;
  }
  return { called, pickups, notCalled };
}
