import { dateStringInZone } from "./tz";
import { emptyBillingDto, type BillingDto } from "./clientBilling";
import type { DispositionStatus } from "./salesDisposition";

// The Client Tracker row for a deal closed before the client exists.
//
// Saving a Sales Data form as PIF or Deposit asks for the tracker row there and
// then (2026-10-09, Jake). The client has no tenant until their intake is
// approved, so the answers wait in public.pending_clients and move onto the
// tenant's client_billing when it is made. See 0151_pending_clients.sql.
//
// Kept pure: the match and the prefill are unit-tested without Supabase.

// Closes recorded before this day never asked for a tracker row, and Willis,
// Made Better, AAG and Clear Choice were typed into the sheet by hand. Without
// the cutoff every old close would light up as owed.
export const TRACKER_SINCE = "2026-10-09";

const CLOSE_STATUSES: ReadonlySet<string> = new Set<DispositionStatus>(["pif", "deposit"]);

export function isCloseStatus(status: string): boolean {
  return CLOSE_STATUSES.has(status);
}

// The meeting still wants its tracker row: a close on or after TRACKER_SINCE
// with nothing saved. Compared on the UTC date, which is close enough for a
// cutoff that only exists to keep old closes quiet.
export function trackerOwed(status: string, scheduledAt: string | null, saved: boolean): boolean {
  if (saved || !isCloseStatus(status)) return false;
  return (scheduledAt ?? "").slice(0, 10) >= TRACKER_SINCE;
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: words[0] ?? "", lastName: words.slice(1).join(" ") };
}

// "10/9/26": how the Client Tracker sheet writes its dates.
export function closedDateLabel(scheduledAt: string | null, timeZone: string): string {
  const ms = scheduledAt ? Date.parse(scheduledAt) : NaN;
  if (!Number.isFinite(ms)) return "";
  const [y, m, d] = dateStringInZone(timeZone, ms).split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

// What the tracker step opens with when nothing has been saved yet.
export function trackerPrefill(
  call: { prospectName: string; scheduledAt: string | null; cashCollected: number | null },
  timeZone: string,
): BillingDto {
  const cash = call.cashCollected && call.cashCollected > 0 ? Math.round(call.cashCollected) : 0;
  return {
    ...emptyBillingDto(),
    ...splitName(call.prospectName),
    dateClosed: closedDateLabel(call.scheduledAt, timeZone),
    upfrontCash: cash,
    totalCashCollected: cash,
  };
}

export interface PendingMatchRow {
  id: string;
  email: string;
  phone: string;
  businessName: string;
}

export interface MatchKeys {
  email: string;
  phone: string;
  businessName: string;
}

function normEmail(v: string): string {
  return v.trim().toLowerCase();
}

// The last ten digits, so "+1 (313) 555-0101" and "3135550101" agree. Fewer
// than ten digits is not a phone number worth matching on.
function normPhone(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

// "Above All Garage Doors, LLC" -> "aboveallgaragedoors".
function normName(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(llc|inc|co|corp|company|ltd)\b/g, " ")
    .replace(/\s+/g, "");
}

// Which waiting row a new client is. Email first, then phone, then business
// name: each is weaker than the last, so a stronger key on one row beats a
// weaker one on another. Blank never matches blank. Pass rows newest first;
// the first hit at a level wins.
export function matchPendingClient(rows: PendingMatchRow[], keys: MatchKeys): string | null {
  const levels: [(r: PendingMatchRow) => string, string][] = [
    [(r) => normEmail(r.email), normEmail(keys.email)],
    [(r) => normPhone(r.phone), normPhone(keys.phone)],
    [(r) => normName(r.businessName), normName(keys.businessName)],
  ];
  for (const [read, want] of levels) {
    if (!want) continue;
    const hit = rows.find((r) => read(r) === want);
    if (hit) return hit.id;
  }
  return null;
}
