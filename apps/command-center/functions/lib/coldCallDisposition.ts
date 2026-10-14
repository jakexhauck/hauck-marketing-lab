import { DIAL_OUTCOMES, isDialOutcome, type DialOutcome } from "./coldCallDials";
import { PENDING_OUTCOME } from "./powerDialer";

// A disposition picked in GoHighLevel's dialer, recorded as a cold call outcome.
//
// Jake moved calling fully into GoHighLevel on 2026-09-30. The eight Custom
// Dispositions in the Hauck Marketing sub-account carry the same names as the
// app's buttons, and one workflow per disposition (Call Details trigger) posts
// here. What a disposition MEANS is still decided by DIAL_OUTCOMES: GoHighLevel
// only names the button, it never gets to say whether a call was a pickup.
//
// Pure, so the rules a commission is argued over are tested. The endpoint is
// api/crm/call-disposition.ts.

export type Parsed =
  | {
      ok: true;
      contactId: string;
      outcome: DialOutcome;
      // The call message id, when the workflow can send it. Optional because
      // the Call Details payload is undocumented (proved on the first live call).
      callId: string | null;
      userEmail: string | null;
      locationId: string | null;
    }
  | { ok: false; error: "no_contact" | "unknown_disposition" };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Lowercase, single spaced. The disposition label is typed by a person in a
// settings page, so "Heard pitch,  said no" must still be pitch_no.
function normalise(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

const OUTCOME_BY_LABEL = new Map<string, DialOutcome>(
  (Object.keys(DIAL_OUTCOMES) as DialOutcome[]).map((key) => [
    normalise(DIAL_OUTCOMES[key].label),
    key,
  ]),
);

// GoHighLevel's workflow Webhook action posts the contact's standard fields at
// the top level (contact_id, location.id) and whatever the workflow adds under
// customData. Either place is read, ours first.
export function parseDisposition(body: unknown): Parsed {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const custom = (
    root.customData && typeof root.customData === "object" ? root.customData : {}
  ) as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const source of [custom, root]) {
      for (const key of keys) {
        const value = str(source[key]);
        if (value) return value;
      }
    }
    return "";
  };

  const contactId = pick("contactId", "contact_id");
  if (!contactId) return { ok: false, error: "no_contact" };

  // A fixed outcome key beats a label: each workflow sends its own key, so a
  // disposition renamed in GoHighLevel cannot silently change what it records.
  const key = pick("outcome");
  const label = pick("disposition", "callDisposition", "call_disposition");
  const outcome = isDialOutcome(key) ? key : OUTCOME_BY_LABEL.get(normalise(label));
  if (!outcome) return { ok: false, error: "unknown_disposition" };

  const location = (root.location && typeof root.location === "object" ? root.location : {}) as Record<
    string,
    unknown
  >;

  return {
    ok: true,
    contactId,
    outcome,
    callId: pick("callId", "messageId", "call_id") || null,
    userEmail: pick("userEmail", "user_email").toLowerCase() || null,
    locationId: str(location.id) || pick("locationId", "location_id") || null,
  };
}

export interface LeadForFields {
  no_answer: number | null;
  first_contact_date: string | null;
}

// What the lead row becomes, column for column, matching what the buttons in
// CallWorkspace.tsx write. Kept identical so a prospect judged in GoHighLevel
// lands on the same stage as one judged in the app.
//
// A callback sets no follow-up date: Jake sets the follow-up in GoHighLevel, and
// a date invented here would put the prospect on the Callbacks page on a day
// nobody agreed to.
export function leadFieldsForOutcome(
  outcome: DialOutcome,
  lead: LeadForFields,
  today: string,
): Record<string, unknown> {
  const touched = {
    last_contact: today,
    first_contact_date: lead.first_contact_date ?? today,
  };
  switch (outcome) {
    case "no_answer": {
      const attempts = (lead.no_answer ?? 0) + 1;
      // Same rule as stageAfterNoAnswer in src/lib/coldCallStages.ts.
      return {
        status: attempts >= 2 ? "No Answer Day 2" : "No Answer Day 1",
        no_answer: attempts,
        ...touched,
        follow_up_date: null,
      };
    }
    case "callback":
      return { status: "Call Back", ...touched };
    case "booked":
      return { status: "Booked", ...touched, follow_up_date: null };
    default:
      return { status: "Not Interested", ...touched, follow_up_date: null };
  }
}

// How far back a pending dial can still be the call being described. A
// disposition is picked seconds after hanging up; two hours covers a caller who
// picks them in a batch at the end of a session.
export const PENDING_LOOKBACK_MS = 2 * 60 * 60_000;

// A judged dial this recent is the same call answered already (in the app, or
// by a webhook GoHighLevel retried). Recording it again would be a double count.
export const ALREADY_JUDGED_MS = 15 * 60_000;

export interface CandidateDial {
  id: string;
  outcome: string;
  callMessageId: string | null;
  dialedAtMs: number;
}

export type DialPick =
  | { kind: "pending"; dialId: string }
  | { kind: "judged"; dialId: string }
  | { kind: "none" };

// Which of this prospect's dials the disposition belongs to.
//
//   pending  complete that row.
//   judged   the call already has an answer; first one wins, do nothing.
//   none     no row for this call yet; the endpoint syncs, then inserts.
export function pickDispositionDial(
  dials: CandidateDial[],
  { callId, now }: { callId: string | null; now: number },
): DialPick {
  if (callId) {
    const exact = dials.find((d) => d.callMessageId === callId);
    if (exact) {
      return exact.outcome === PENDING_OUTCOME
        ? { kind: "pending", dialId: exact.id }
        : { kind: "judged", dialId: exact.id };
    }
  }

  const newestFirst = [...dials].sort((a, b) => b.dialedAtMs - a.dialedAtMs);

  const pending = newestFirst.find(
    (d) => d.outcome === PENDING_OUTCOME && now - d.dialedAtMs <= PENDING_LOOKBACK_MS,
  );
  if (pending) return { kind: "pending", dialId: pending.id };

  const judged = newestFirst.find(
    (d) => d.outcome !== PENDING_OUTCOME && now - d.dialedAtMs <= ALREADY_JUDGED_MS,
  );
  if (judged) return { kind: "judged", dialId: judged.id };

  return { kind: "none" };
}
