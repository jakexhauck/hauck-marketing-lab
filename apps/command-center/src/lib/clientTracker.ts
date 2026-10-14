// Pure helpers for Operations > Clients (the Client Tracker sheet as a page).
// No Date.now(): "today" is passed in so the stale-touchpoint rule is testable.

// A last touchpoint older than this many days paints the cell red, the way the
// sheet flags its stale row.
export const STALE_TOUCHPOINT_DAYS = 14;

// Read a typed date cell. The sheet writes M/D/YY ("1/8/26"); the Billing
// cards have taken free text ("Jun 12, 2026"), so both are read. Anything
// else is null and never flagged.
export function parseSheetDate(text: string): Date | null {
  const raw = text.trim();
  if (!raw) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
    return d.getMonth() === Number(m[1]) - 1 ? d : null;
  }
  if (!/[a-z]/i.test(raw)) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

export function isStaleTouchpoint(text: string, today: Date): boolean {
  const d = parseSheetDate(text);
  if (!d) return false;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = (start.getTime() - d.getTime()) / 86_400_000;
  return days > STALE_TOUCHPOINT_DAYS;
}
