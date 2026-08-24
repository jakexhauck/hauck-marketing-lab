import { normalizePhone } from "./internalRecipients";
import type { SalesCallOutcome } from "./salesCalls";

// The GHL disposition form, parsed.
//
// The end-of-call recorder is Jake's GoHighLevel form
// (form RaoIfnclY5sytH5ndisi on the Hauck Marketing location), not the in-app
// panel. Two workflows post to /api/webhook and both land here first:
//
//   PostCallForm      -- "this meeting is confirmed, here is its form URL"
//   SalesDisposition  -- "the form was submitted; here are the answers"
//
// Everything in this file is pure so the whole mapping is unit-tested without
// Supabase or GHL. The I/O half that calls it lives in salesDispositionApply.ts.
//
// The radio's exact strings were read off the live form (2026-08-24):
//   PIF / Deposit / No-Close / No-Show / Follow Up / Unqualified / Cancelled
// Matching tolerates case, spaces and hyphens ("no close" == "No-Close"), but
// anything else parses as UNKNOWN, and unknown stamps nothing: a partial or
// unexpected submission may fill the free-text columns but never invents an
// outcome for a call somebody has not dispositioned.

export interface ParsedStatus {
  // Null only for Cancelled, which is a fact about the CALENDAR, not an
  // outcome. The outcome check constraint has no cancelled value and the sheet
  // reads cancellation off appointment_status instead.
  outcome: SalesCallOutcome | null;
  // Unqualified sets this false, exactly as the old panel did; every other
  // status leaves the recorded qualified bit alone.
  qualified?: boolean;
  // Cancelled flips appointment_status. Calendar sync otherwise owns that
  // column; the form is allowed to write it deliberately, and if GHL still says
  // confirmed afterwards the fix is cancelling there too.
  cancelAppointment: boolean;
}

const STATUS_MAP: Record<string, ParsedStatus> = {
  pif: { outcome: "closed", cancelAppointment: false },
  deposit: { outcome: "closed", cancelAppointment: false },
  noclose: { outcome: "not_interested", cancelAppointment: false },
  noshow: { outcome: "no_show", cancelAppointment: false },
  followup: { outcome: "follow_up", cancelAppointment: false },
  unqualified: { outcome: "not_qualified", qualified: false, cancelAppointment: false },
  cancelled: { outcome: null, cancelAppointment: true },
};

function statusKey(raw: unknown): string {
  return typeof raw === "string"
    ? raw.trim().toLowerCase().replace(/[^a-z]/g, "")
    : "";
}

export function parseStatus(raw: unknown): ParsedStatus | null {
  const key = statusKey(raw);
  if (!key) return null;
  // Unknown strings return null rather than a guess: the free-text fields may
  // still be stamped, but the row stays Awaiting until the radio says one of
  // the seven things the form actually offers.
  const hit = STATUS_MAP[key];
  return hit ? { ...hit } : null;
}

// "$1,200", "1200.50", " 2,000 " -> number. Blank, negative or nonsense -> null.
// Money arrives from a browser form, so tolerance is cheap and a silent zero
// would be expensive: null means "not answered", which the sheet renders as a
// dash, while 0 would claim the deal was free.
export function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Free-text answers pass through trimmed, or drop out entirely. An empty string
// must never overwrite something already stored on the row.
export function parseText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text ? text : null;
}

// ---------------------------------------------------------------------------
// PostCallForm: the URL a confirmed meeting is worked from
// ---------------------------------------------------------------------------

// Only URLs the agency itself serves are accepted, so a misconfigured workflow
// cannot stamp foreign links onto an admin surface. Exact prefix, no host games.
export const FORM_URL_PREFIX = "https://link.hauckmarketing.com/widget/form/";

export function isAllowedFormUrl(url: unknown): boolean {
  return typeof url === "string" && url.startsWith(FORM_URL_PREFIX);
}

// ---------------------------------------------------------------------------
// Which meeting row a submission belongs to
// ---------------------------------------------------------------------------

// The slice of sales_calls the picker needs. The apply layer maps DB rows onto
// this, so the selection rule is testable without Supabase.
export interface TargetableCall {
  id: string;
  ghl_contact_id: string | null;
  phone: string | null;
  outcome: string | null;
  scheduled_at: string | null;
}

// A submission goes to that contact's most recent meeting with NO OUTCOME yet,
// matched by contact id first and by normalised phone second (the form carries
// the phone in its query string, so phone is always present even when the
// workflow body omits contactId).
//
// Every meeting recorded means NO MATCH, not "overwrite the newest": a retry or
// double-submission finds the row already stamped and no-ops, and a form filled
// against the wrong prospect can never rewrite history. Nothing to stamp is
// logged upstream and dropped.
export function pickTargetCall<T extends TargetableCall>(
  rows: T[],
  contactId: string | null,
  phone: string | null,
): T | null {
  const wantId = typeof contactId === "string" ? contactId.trim() : "";
  const wantPhone = normalizePhone(phone ?? "");

  const mine = rows.filter((row) => {
    if (wantId && row.ghl_contact_id === wantId) return true;
    if (wantPhone) {
      const have = normalizePhone(row.phone ?? "");
      if (have && have === wantPhone) return true;
    }
    return false;
  });

  const open = mine.filter((row) => !row.outcome);
  if (open.length === 0) return null;

  // Most recent first; a row with no time sorts last but still beats nothing.
  return [...open].sort((a, b) =>
    (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? ""),
  )[0];
}

// ---------------------------------------------------------------------------
// SalesDisposition: the answers -> a patch on the meeting row
// ---------------------------------------------------------------------------

export interface DispositionFields {
  status: unknown;
  cashCollected: unknown;
  revenueGenerated: unknown;
  paymentPlatform: unknown;
  recordingLink: unknown;
  feedback: unknown;
}

export interface DispositionPatch {
  // Column names match sales_calls, so the apply layer can hand this straight
  // to .update(). Keys are present ONLY when there is something real to write;
  // absent means "leave what is stored".
  outcome?: SalesCallOutcome;
  qualified?: boolean;
  appointment_status?: string;
  cash_collected?: number;
  revenue_generated?: number;
  payment_platform?: string;
  recording_link?: string;
  // Feedback appends rather than replaces, so a re-opened form's notes add to
  // the story rather than deleting it. Carried apart because appending needs
  // the existing scratchpad off the row.
  feedback: string;
}

export function buildDispositionPatch(fields: DispositionFields): DispositionPatch {
  const patch: DispositionPatch = { feedback: "" };

  const status = parseStatus(fields.status);
  if (status) {
    if (status.outcome) patch.outcome = status.outcome;
    if (status.qualified !== undefined) patch.qualified = status.qualified;
    if (status.cancelAppointment) patch.appointment_status = "cancelled";
  }

  const cash = parseMoney(fields.cashCollected);
  if (cash !== null) patch.cash_collected = cash;

  const revenue = parseMoney(fields.revenueGenerated);
  if (revenue !== null) patch.revenue_generated = revenue;

  const platform = parseText(fields.paymentPlatform);
  if (platform) patch.payment_platform = platform;

  const recording = parseText(fields.recordingLink);
  if (recording) patch.recording_link = recording;

  patch.feedback = parseText(fields.feedback) ?? "";

  return patch;
}

// Whether the patch carries anything worth an UPDATE at all. A submission with
// nothing usable (unknown status, blank everything) is acked and dropped.
export function patchIsEmpty(patch: DispositionPatch): boolean {
  return (
    patch.outcome === undefined &&
    patch.qualified === undefined &&
    patch.appointment_status === undefined &&
    patch.cash_collected === undefined &&
    patch.revenue_generated === undefined &&
    patch.payment_platform === undefined &&
    patch.recording_link === undefined &&
    !patch.feedback
  );
}
