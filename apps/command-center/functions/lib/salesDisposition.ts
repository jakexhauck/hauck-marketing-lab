import type { SalesCallOutcome } from "./salesCalls";

// The post-call form, parsed.
//
// This used to be Jake's GoHighLevel form (RaoIfnclY5sytH5ndisi) plus two
// workflows posting to /api/webhook. It was never submitted once: the workflow
// that put the form link on a meeting fired for one meeting in twenty-three, so
// there was nothing to press. The same fields now live in Sales Data itself
// (SalesCallForm.tsx) and save through PATCH /api/admin/tracker/sales-data.
//
// Kept pure so the whole mapping is unit-tested without Supabase.
//
// The form is an EDITOR, not an append log: reopening a meeting shows what was
// saved and saving again replaces it, so a mistake is fixed by correcting it.

export type DispositionStatus =
  | "pif"
  | "deposit"
  | "noclose"
  | "noshow"
  | "followup"
  | "unqualified"
  | "cancelled";

interface StatusMeta {
  key: DispositionStatus;
  label: string;
  // Null only for Cancelled: a meeting that never ran produced nothing.
  outcome: SalesCallOutcome | null;
  // Pitched means qualified, Unqualified means not, and a meeting nobody
  // turned up to says nothing either way.
  qualified: boolean | null;
}

// The GHL form's seven answers, in its order.
export const DISPOSITION_STATUSES: StatusMeta[] = [
  { key: "pif", label: "PIF", outcome: "closed", qualified: true },
  { key: "deposit", label: "Deposit", outcome: "closed", qualified: true },
  { key: "noclose", label: "No-Close", outcome: "not_interested", qualified: true },
  { key: "noshow", label: "No-Show", outcome: "no_show", qualified: null },
  { key: "followup", label: "Follow Up", outcome: "follow_up", qualified: true },
  { key: "unqualified", label: "Unqualified", outcome: "not_qualified", qualified: false },
  { key: "cancelled", label: "Cancelled", outcome: null, qualified: null },
];

const BY_KEY = new Map(DISPOSITION_STATUSES.map((s) => [s.key, s]));

export function isDispositionStatus(value: unknown): value is DispositionStatus {
  return typeof value === "string" && BY_KEY.has(value as DispositionStatus);
}

// A meeting recorded before the form existed (the old in-app panel) has an
// outcome and no status. The form opens on the nearest answer rather than on
// nothing, so saving it does not wipe that outcome by accident. Closed maps to
// PIF because the old panel never asked which.
export function statusFromOutcome(outcome: string | null): DispositionStatus | "" {
  const hit = DISPOSITION_STATUSES.find((s) => s.outcome !== null && s.outcome === outcome);
  return hit ? hit.key : "";
}

// "$1,200", "1200.50", " 2,000 " -> number. Blank, negative or nonsense -> null.
// null means "not answered", which the sheet renders as a dash; 0 would claim
// the deal was free.
export function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function text(raw: unknown, cap: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, cap) : "";
}

function isBlank(raw: unknown): boolean {
  return raw === null || raw === undefined || String(raw).trim() === "";
}

export interface DispositionInput {
  status: unknown;
  cashCollected: unknown;
  revenueGenerated: unknown;
  paymentPlatform: unknown;
  recordingLink: unknown;
  notes: unknown;
}

// Column names match sales_calls, so the endpoint hands this straight to
// .update(). Every key is always present: the form replaces what was saved.
export interface DispositionUpdate {
  disposition_status: DispositionStatus;
  outcome: SalesCallOutcome | null;
  qualified: boolean | null;
  cash_collected: number | null;
  revenue_generated: number | null;
  payment_platform: string;
  recording_link: string;
  scratchpad: string;
}

export type DispositionResult =
  | { ok: true; update: DispositionUpdate }
  | { ok: false; error: string };

// Same ceiling recordSalesCall uses for the scratchpad.
const NOTES_CAP = 4000;

export function buildDispositionUpdate(input: DispositionInput): DispositionResult {
  if (!isDispositionStatus(input.status)) {
    return { ok: false, error: "Pick a status." };
  }
  const status = BY_KEY.get(input.status)!;

  // Money a person typed and we could not read is refused, not dropped: a
  // silently blank Cash column is how the month ends up wrong again.
  const cash = parseMoney(input.cashCollected);
  if (cash === null && !isBlank(input.cashCollected)) {
    return { ok: false, error: "Cash Collected must be a number." };
  }
  const revenue = parseMoney(input.revenueGenerated);
  if (revenue === null && !isBlank(input.revenueGenerated)) {
    return { ok: false, error: "Revenue Generated must be a number." };
  }

  // Rendered as a link on the sheet, so only a web address gets in.
  const recording = text(input.recordingLink, 500);
  if (recording && !/^https?:\/\/\S+$/i.test(recording)) {
    return { ok: false, error: "Recording must be a link starting with https://." };
  }

  return {
    ok: true,
    update: {
      disposition_status: status.key,
      outcome: status.outcome,
      qualified: status.qualified,
      cash_collected: cash,
      revenue_generated: revenue,
      payment_platform: text(input.paymentPlatform, 80),
      recording_link: recording,
      scratchpad: text(input.notes, NOTES_CAP),
    },
  };
}
