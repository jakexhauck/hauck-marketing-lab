// The demo call: its vocabulary, the shape of a deal, and the arithmetic that
// turns logged calls into the Sales Data funnel.
//
// Pure and free of both React and the network, so the numbers that describe how
// the agency actually sells can be proved directly. Nothing here invents a
// value: a count with no rows behind it is 0, and a deal component nobody
// ticked is absent rather than zero, because "no retainer" and "a retainer of
// $0" are different facts.
//
// Mirrors migration 0057. The client-side copy of the vocabulary lives in
// src/lib/salesCalls.ts; a test on each side guards the pair against drift, the
// same way coldCallStages.ts and the leads endpoint already do.

// ---------------------------------------------------------------------------
// Outcomes

export const SALES_OUTCOMES = ["closed", "follow_up", "no_show", "not_a_fit"] as const;

export type SalesOutcome = (typeof SALES_OUTCOMES)[number];

export function isSalesOutcome(value: unknown): value is SalesOutcome {
  return typeof value === "string" && (SALES_OUTCOMES as readonly string[]).includes(value);
}

// A call was "taken" if it happened at all. A no-show is the one outcome that
// is not a call: counting it as taken would quietly flatter both the show-up
// rate and the close rate, which are the two numbers this whole surface exists
// to tell the truth about.
export function wasTaken(outcome: string | null | undefined): boolean {
  return isSalesOutcome(outcome) && outcome !== "no_show";
}

// ---------------------------------------------------------------------------
// Guided note sections
//
// Mirrors the default in migration 0057. Used when the settings row has never
// been written, so a fresh install still has sensible prompts.

export interface NoteSection {
  id: string;
  label: string;
}

export const DEFAULT_NOTE_SECTIONS: NoteSection[] = [
  { id: "situation", label: "Their situation" },
  { id: "problem", label: "The problem" },
  { id: "cost", label: "What it is costing them" },
  { id: "budget", label: "Budget" },
  { id: "decision", label: "Decision maker" },
  { id: "objections", label: "Objections" },
];

const MAX_SECTIONS = 20;
const MAX_LABEL = 80;

// Sections as stored: a list of {id,label} with unique, non-empty ids. Anything
// malformed is dropped rather than rejected wholesale, because a single bad
// entry must not cost Jake the other five prompts.
export function sanitizeNoteSections(input: unknown): NoteSection[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: NoteSection[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim().slice(0, 40) : "";
    const label = typeof rec.label === "string" ? rec.label.trim().slice(0, MAX_LABEL) : "";
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
    if (out.length >= MAX_SECTIONS) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The deal
//
// Only the components that were ticked are stored. Every field is optional and
// independent, so a structure nobody has invented yet is just a combination
// that has not come up: an upfront fee with a revenue share, a flat retainer, a
// per-job fee on its own.

export interface Deal {
  upfrontFee?: number;
  monthlyRetainer?: number;
  revSharePct?: number;
  perJobFee?: number;
  contractMonths?: number;
  adSpendBudget?: number;
}

const DEAL_MONEY_FIELDS = ["upfrontFee", "monthlyRetainer", "perJobFee", "adSpendBudget"] as const;

// Money as typed. Tolerates "$4,500.00" the way the Sales Data tracker already
// does, so what a human types and what gets stored agree.
export function toMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// A percentage, clamped to 0..100. Anything outside that is a typo, and a
// 400% revenue share stored as fact is worse than a rejected field.
function toPct(value: unknown): number | null {
  const n = toMoney(value);
  if (n === null) return null;
  return n <= 100 ? n : null;
}

function toCount(value: unknown): number | null {
  const n = toMoney(value);
  if (n === null) return null;
  return Number.isInteger(n) && n > 0 ? n : null;
}

// The stored deal, or null when nothing was ticked. Null rather than {} so a
// closed call with no terms recorded reads as "nobody filled it in" instead of
// as an empty deal that was.
export function sanitizeDeal(input: unknown): Deal | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  const out: Deal = {};

  for (const field of DEAL_MONEY_FIELDS) {
    const n = toMoney(rec[field]);
    if (n !== null) out[field] = n;
  }
  const pct = toPct(rec.revSharePct);
  if (pct !== null) out.revSharePct = pct;
  const months = toCount(rec.contractMonths);
  if (months !== null) out.contractMonths = months;

  return Object.keys(out).length ? out : null;
}

// What the deal is worth over its committed term, for the one question the
// current tracker cannot answer: how much did I actually sign this month.
//
// Deliberately ignores revenue share and per-job fees. Both depend on work the
// client has not done yet, and folding a guess at them into a "contract value"
// would put an invented number next to two real ones.
export function committedValue(deal: Deal | null): number {
  if (!deal) return 0;
  const upfront = deal.upfrontFee ?? 0;
  const monthly = deal.monthlyRetainer ?? 0;
  const months = deal.contractMonths ?? 0;
  return upfront + monthly * months;
}

// ---------------------------------------------------------------------------
// Reconciling the calendar into rows

export interface DemoAppointment {
  id: string;
  title: string;
  startTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
}

export interface LeadFacts {
  id: string;
  firstName: string;
  lastName: string;
  businessName: string;
  phone: string;
  email: string;
  timezone: string;
  source: string;
}

export interface ReconcileRow {
  ghl_appointment_id: string;
  ghl_contact_id: string | null;
  lead_id: string | null;
  prospect_name: string;
  business_name: string;
  phone: string;
  email: string;
  timezone: string;
  source: string;
  scheduled_at: string | null;
  appointment_status: string;
}

// GHL titles a cold-call booking "Discovery call - Jane Smith"
// (functions/api/admin/cold-call/book.ts). When no lead is matched, that suffix
// is the only name available, so it is worth recovering rather than showing a
// card that says "Discovery call -" to somebody about to dial it.
export function nameFromTitle(title: string): string {
  const idx = title.indexOf(" - ");
  return idx >= 0 ? title.slice(idx + 3).trim() : "";
}

// One appointment plus whatever the lead book knows about that contact, as the
// row to upsert.
//
// The lead wins on every field it has. It is the record a human typed and
// corrected; the calendar only ever knew what the booking form captured.
export function reconcileRow(
  appt: DemoAppointment,
  lead: LeadFacts | null,
): ReconcileRow {
  const leadName = lead ? `${lead.firstName} ${lead.lastName}`.trim() : "";
  const prospectName =
    leadName || appt.contactName.trim() || nameFromTitle(appt.title) || "Unnamed prospect";

  return {
    ghl_appointment_id: appt.id,
    ghl_contact_id: appt.contactId || null,
    lead_id: lead?.id ?? null,
    prospect_name: prospectName,
    business_name: lead?.businessName ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    timezone: lead?.timezone ?? "",
    source: lead?.source ?? "",
    scheduled_at: appt.startTime,
    appointment_status: (appt.status || "confirmed").toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// The Sales Data funnel, derived
//
// These six counts are exactly the input columns of src/lib/salesTracker.ts.
// Deriving them here means the rates that page already computes (show-up,
// qualified, close, close-from-qualified) start describing logged calls instead
// of remembered ones, with no change to that arithmetic.

export interface DayCounts {
  callsOnCalendar: number;
  rescheduledCancelled: number;
  callsTaken: number;
  qualified: number;
  closed: number;
  cashCollected: number;
}

export interface CountableCall {
  scheduled_at: string | null;
  appointment_status: string;
  outcome: string | null;
  qualified: boolean | null;
  cash_collected: number | string | null;
}

export function emptyDayCounts(): DayCounts {
  return {
    callsOnCalendar: 0,
    rescheduledCancelled: 0,
    callsTaken: 0,
    qualified: 0,
    closed: 0,
    cashCollected: 0,
  };
}

// Which calendar day a timestamp falls on, in the timezone the agency sells in.
// Not a UTC slice: a 7pm New York call is that day's call, and UTC would file it
// under tomorrow and quietly move a close into the wrong month.
export function dayInZone(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    // en-CA renders as YYYY-MM-DD, which is the format the tracker keys on.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    // An unknown timezone must not take the page down with it.
    return new Date(ms).toISOString().slice(0, 10);
  }
}

const CANCELLED = new Set(["cancelled", "canceled", "noshow", "no_show", "invalid"]);

// Every logged call grouped into the day it was scheduled for, as the six
// counts Sales Data types by hand today.
//
// Keyed on the SCHEDULED day rather than the logged day on purpose: a call that
// ran late and got written up the next morning still belongs to the day it was
// booked for, or a Monday of calls can show up as a Tuesday of closes.
export function countsByDay(
  calls: CountableCall[],
  timeZone: string,
): Record<string, DayCounts> {
  const out: Record<string, DayCounts> = {};

  for (const call of calls) {
    const day = dayInZone(call.scheduled_at, timeZone);
    if (!day) continue;
    const counts = (out[day] ??= emptyDayCounts());

    counts.callsOnCalendar += 1;

    if (CANCELLED.has(call.appointment_status)) counts.rescheduledCancelled += 1;
    if (wasTaken(call.outcome)) counts.callsTaken += 1;
    if (call.qualified === true) counts.qualified += 1;
    if (call.outcome === "closed") counts.closed += 1;

    const cash = toMoney(call.cash_collected);
    if (cash !== null) counts.cashCollected += cash;
  }

  return out;
}

// Whether a day's Sales Data cells are derived rather than typed. A day with no
// calls on the calendar at all stays typeable, so history entered before this
// surface existed is never locked behind a page that has nothing to show.
export function isDerivedDay(counts: DayCounts | undefined): boolean {
  return !!counts && counts.callsOnCalendar > 0;
}
