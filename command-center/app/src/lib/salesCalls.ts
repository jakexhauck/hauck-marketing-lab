// The demo call, client side: the four views, the outcome vocabulary, the deal
// components, and the list arithmetic behind each view.
//
// Pure and free of React, so what belongs in "Follow-ups owed" and what counts
// as an unlogged call can be proved without rendering anything.
//
// The outcome vocabulary MIRRORS functions/lib/salesCalls.ts and the CHECK
// constraint in migration 0057. A test on each side guards the pair, the same
// way coldCallStages.ts and the leads endpoint already do.

export const SALES_OUTCOMES = ["closed", "follow_up", "no_show", "not_a_fit"] as const;

export type SalesOutcome = (typeof SALES_OUTCOMES)[number];

export interface OutcomeMeta {
  label: string;
  // What this outcome means, shown under the button so a mis-click is unlikely
  // rather than merely undoable.
  meaning: string;
  swatch: string;
  // Does picking it open a follow-up question before the call can be logged?
  needsDeal?: boolean;
  needsFollowUp?: boolean;
  needsReason?: boolean;
}

export const OUTCOME_META: Record<SalesOutcome, OutcomeMeta> = {
  closed: {
    label: "Closed",
    meaning: "They said yes. Record the deal.",
    swatch: "#10b981",
    needsDeal: true,
  },
  follow_up: {
    label: "Follow-up booked",
    meaning: "Not a no. Needs another call.",
    swatch: "#0ea5e9",
    needsFollowUp: true,
  },
  no_show: {
    label: "No show",
    meaning: "They never joined. Does not count as a call taken.",
    swatch: "#f59e0b",
  },
  not_a_fit: {
    label: "Not a fit",
    meaning: "Disqualified. Record why.",
    swatch: "#c78b93",
    needsReason: true,
  },
};

// ---------------------------------------------------------------------------
// Guided note prompts
//
// Editable, stored in agency_settings.call_note_sections. The answers on a call
// are keyed by `id`, so renaming a prompt keeps every old answer readable and
// removing one hides the prompt without destroying what was said under it.

export interface NoteSection {
  id: string;
  label: string;
}

export function outcomeLabel(outcome: string | null | undefined): string {
  return outcome && outcome in OUTCOME_META
    ? OUTCOME_META[outcome as SalesOutcome].label
    : "Not logged";
}

// ---------------------------------------------------------------------------
// The deal
//
// Components rather than named types: every structure Jake sells, and every one
// he invents later, is a different combination of these. A retainer, a straight
// performance split, an upfront fee with a revenue share, pay per job.

export interface DealComponentDef {
  key: DealComponentKey;
  label: string;
  // How the amount reads: money, a percentage, or a plain count.
  unit: "money" | "percent" | "months";
  hint: string;
}

export type DealComponentKey =
  | "upfrontFee"
  | "monthlyRetainer"
  | "revSharePct"
  | "perJobFee";

export const DEAL_COMPONENTS: DealComponentDef[] = [
  { key: "upfrontFee", label: "Upfront fee", unit: "money", hint: "One-off, paid to start" },
  { key: "monthlyRetainer", label: "Monthly retainer", unit: "money", hint: "Every month" },
  { key: "revSharePct", label: "% of revenue per job", unit: "percent", hint: "Performance split" },
  { key: "perJobFee", label: "$ per booked job", unit: "money", hint: "Pay per result" },
];

// Captured alongside the components, on every deal rather than per component.
export const DEAL_EXTRAS = [
  { key: "contractMonths" as const, label: "Contract length", unit: "months" as const },
  { key: "adSpendBudget" as const, label: "Ad spend budget", unit: "money" as const },
];

export interface Deal {
  upfrontFee?: number;
  monthlyRetainer?: number;
  revSharePct?: number;
  perJobFee?: number;
  contractMonths?: number;
  adSpendBudget?: number;
}

// The deal in one line, for a card. Only what was actually agreed, so a
// retainer-only deal never reads as though a revenue share was discussed.
export function describeDeal(deal: Deal | null | undefined): string {
  if (!deal) return "";
  const parts: string[] = [];
  if (deal.upfrontFee) parts.push(`${money(deal.upfrontFee)} upfront`);
  if (deal.monthlyRetainer) parts.push(`${money(deal.monthlyRetainer)}/mo`);
  if (deal.revSharePct) parts.push(`${deal.revSharePct}% of revenue`);
  if (deal.perJobFee) parts.push(`${money(deal.perJobFee)} per job`);
  if (deal.contractMonths) parts.push(`${deal.contractMonths} months`);
  return parts.join(", ");
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const digits = Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ---------------------------------------------------------------------------
// The row, as the API returns it

export interface SalesCall {
  id: string;
  ghlAppointmentId: string;
  ghlContactId: string | null;
  leadId: string | null;
  prospectName: string;
  businessName: string;
  phone: string;
  email: string;
  timezone: string;
  source: string;
  scheduledAt: string | null;
  appointmentStatus: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  outcome: SalesOutcome | null;
  qualified: boolean | null;
  notAFitReason: string | null;
  followUpAt: string | null;
  sections: Record<string, string>;
  scratchpad: string;
  deal: Deal | null;
  cashCollected: number | null;
}

// The API answers in snake_case straight from the table. Mapping here rather
// than reshaping server-side keeps the endpoint a thin read and puts the one
// naming boundary in a place a test can see.
export function mapApiCall(raw: Record<string, unknown>): SalesCall {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: String(raw.id ?? ""),
    ghlAppointmentId: String(raw.ghl_appointment_id ?? ""),
    ghlContactId: (raw.ghl_contact_id as string | null) ?? null,
    leadId: (raw.lead_id as string | null) ?? null,
    prospectName: String(raw.prospect_name ?? ""),
    businessName: String(raw.business_name ?? ""),
    phone: String(raw.phone ?? ""),
    email: String(raw.email ?? ""),
    timezone: String(raw.timezone ?? ""),
    source: String(raw.source ?? ""),
    scheduledAt: (raw.scheduled_at as string | null) ?? null,
    appointmentStatus: String(raw.appointment_status ?? "confirmed"),
    startedAt: (raw.started_at as string | null) ?? null,
    endedAt: (raw.ended_at as string | null) ?? null,
    durationSeconds: num(raw.duration_seconds),
    outcome: (raw.outcome as SalesOutcome | null) ?? null,
    qualified: typeof raw.qualified === "boolean" ? raw.qualified : null,
    notAFitReason: (raw.not_a_fit_reason as string | null) ?? null,
    followUpAt: (raw.follow_up_at as string | null) ?? null,
    sections: (raw.sections as Record<string, string> | null) ?? {},
    scratchpad: String(raw.scratchpad ?? ""),
    deal: (raw.deal as Deal | null) ?? null,
    cashCollected: num(raw.cash_collected),
  };
}

// ---------------------------------------------------------------------------
// The four views

export const SALES_CALL_VIEWS = ["today", "upcoming", "follow-ups", "history"] as const;

export type SalesCallView = (typeof SALES_CALL_VIEWS)[number];

export const VIEW_LABELS: Record<SalesCallView, string> = {
  today: "Today",
  upcoming: "Upcoming",
  "follow-ups": "Follow-ups",
  history: "History",
};

export function resolveView(param: string | null | undefined): SalesCallView {
  return param && (SALES_CALL_VIEWS as readonly string[]).includes(param)
    ? (param as SalesCallView)
    : "today";
}

// A call is logged once it carries an outcome. Everything else about it, the
// notes, the timer, the deal, can be half-finished; the outcome is the thing
// that says somebody decided what happened.
export function isLogged(call: SalesCall): boolean {
  return call.outcome !== null;
}

// A call in progress: started and not yet finished. Rendered differently
// because clicking away from a live call and losing it is the one thing this
// page must not do.
export function isInProgress(call: SalesCall): boolean {
  return call.startedAt !== null && call.endedAt === null && !isLogged(call);
}

// The day a call sits on, in the viewer's own clock. The list groups by this,
// and the browser's timezone is the right one here: it is the clock Jake reads
// the time off when he decides whether to dial.
export function localDay(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

// Calls happening today, soonest first. Includes ones already logged, so the
// day reads as a whole rather than emptying itself as work gets done.
export function todayCalls(calls: SalesCall[], now = new Date()): SalesCall[] {
  const today = todayLocal(now);
  return calls
    .filter((c) => localDay(c.scheduledAt) === today)
    .sort(byScheduled);
}

// The next seven days, today excluded. Today has its own view, and repeating it
// here would double every card on screen.
export function upcomingCalls(calls: SalesCall[], now = new Date()): SalesCall[] {
  const today = todayLocal(now);
  const horizon = new Date(now.getTime() + 7 * 864e5);
  const last = todayLocal(horizon);
  return calls
    .filter((c) => {
      const day = localDay(c.scheduledAt);
      return day > today && day <= last;
    })
    .sort(byScheduled);
}

// Follow-ups owed: a call that ended in "follow-up booked" and has no later
// call against the same prospect yet.
//
// Matched on contact id rather than on name. Two prospects can share a name,
// and the whole point of this view is that nothing quietly falls out of it.
export function followUpsOwed(calls: SalesCall[], now = new Date()): SalesCall[] {
  const owed = calls.filter((c) => c.outcome === "follow_up");
  if (!owed.length) return [];

  return owed
    .filter((call) => {
      const laterExists = calls.some(
        (other) =>
          other.id !== call.id &&
          !!call.ghlContactId &&
          other.ghlContactId === call.ghlContactId &&
          (other.scheduledAt ?? "") > (call.scheduledAt ?? ""),
      );
      return !laterExists;
    })
    .sort((a, b) => {
      // Overdue first: a follow-up date that has been and gone is the most
      // urgent thing on the page.
      const aDue = a.followUpAt ?? a.scheduledAt ?? "";
      const bDue = b.followUpAt ?? b.scheduledAt ?? "";
      return aDue.localeCompare(bDue);
    })
    .filter((c) => {
      // A follow-up booked for the future is not yet owed; it is simply
      // upcoming. Only show it once its time has arrived or passed.
      if (!c.followUpAt) return true;
      return Date.parse(c.followUpAt) <= now.getTime() + 864e5;
    });
}

// Everything that has already happened, newest first.
export function historyCalls(calls: SalesCall[], now = new Date()): SalesCall[] {
  const today = todayLocal(now);
  return calls
    .filter((c) => {
      const day = localDay(c.scheduledAt);
      return !!day && day < today;
    })
    .sort((a, b) => byScheduled(b, a));
}

// A past call nobody logged. It gets a "Log it" button rather than a Start Call
// one: without this, Sales Data quietly under-counts every call Jake forgot to
// open the page for.
export function needsLogging(call: SalesCall, now = new Date()): boolean {
  if (isLogged(call)) return false;
  if (!call.scheduledAt) return false;
  return Date.parse(call.scheduledAt) < now.getTime();
}

// How many past calls are still unlogged, for the nudge on the History tab.
// Sales Data is only as honest as this number is small.
export function needsLoggingCount(calls: SalesCall[], now = new Date()): number {
  return calls.filter((c) => needsLogging(c, now)).length;
}

function byScheduled(a: SalesCall, b: SalesCall): number {
  return (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "");
}

// Free-text search across a call's identifying fields, for the history view.
export function searchCalls(calls: SalesCall[], query: string): SalesCall[] {
  const q = query.trim().toLowerCase();
  if (!q) return calls;
  return calls.filter((c) =>
    [c.prospectName, c.businessName, c.phone, c.email, c.source]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

// ---------------------------------------------------------------------------
// Formatting

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDay(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// A duration as mm:ss, or h:mm:ss once it runs past an hour. Used by the live
// timer and by the logged duration on a past call.
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
