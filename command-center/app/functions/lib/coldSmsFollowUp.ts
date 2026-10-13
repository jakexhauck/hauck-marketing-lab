// Cold SMS follow-ups (0161): the date rules, pure so the board and the server
// agree and both are tested. A follow-up is a calendar day in Jake's zone.

export type FollowUpState = "later" | "due" | "overdue";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
}

// Due today in Jake's zone reads "due", before it "later", after it "overdue".
// Both are YYYY-MM-DD, so plain string order is date order.
export function followUpState(day: string, today: string): FollowUpState {
  if (day === today) return "due";
  return day < today ? "overdue" : "later";
}

// "Thu, Oct 16". The day is already a calendar date, so it is formatted as UTC
// to keep it from shifting.
export function followUpLabel(day: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

// The day n days after `today` (both YYYY-MM-DD).
export function addDays(today: string, n: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
