// Pure helpers behind Management's Contract rail. "now" is always passed in so
// the countdown and the timeline are testable.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayNumber(iso: string): number | null {
  const m = ISO.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY : null;
}

function today(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY;
}

// "2026-09-01" -> "Sep 1, 2026". Blank for no date.
export function formatContractDate(iso: string | null): string {
  const m = iso ? ISO.exec(iso) : null;
  if (!m) return "";
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// Whole days from today to the end date. Negative once it has passed.
export function daysLeft(end: string | null, now: Date): number | null {
  const e = end ? dayNumber(end) : null;
  return e === null ? null : e - today(now);
}

// The pill on the rail: how long is left, or that it has ended.
export function endLabel(end: string | null, now: Date): { text: string; soon: boolean } | null {
  const d = daysLeft(end, now);
  if (d === null) return null;
  if (d < 0) return { text: "Ended", soon: true };
  if (d === 0) return { text: "Ends today", soon: true };
  return { text: `Ends in ${d} ${d === 1 ? "day" : "days"}`, soon: d <= 30 };
}

// How far through the term today is, 0 to 1, for the timeline bar.
export function termProgress(start: string | null, end: string | null, now: Date): number | null {
  const s = start ? dayNumber(start) : null;
  const e = end ? dayNumber(end) : null;
  if (s === null || e === null || e <= s) return null;
  return Math.min(1, Math.max(0, (today(now) - s) / (e - s)));
}

export function formatDollars(n: number | null): string {
  return n === null ? "" : `$${Math.round(n).toLocaleString("en-US")}`;
}

export function lengthLabel(months: number | null): string {
  if (months === null) return "";
  return `${months} ${months === 1 ? "month" : "months"}`;
}
