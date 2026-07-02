import type { ApiInvoice, ApiTransaction } from "./api";

// Payment statuses GHL reports for money that actually settled.
const PAID_STATES = new Set(["succeeded", "paid", "completed", "success"]);

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Money owed to the client right now: invoices that are sent but not yet paid
// (or overdue). Real sums only, never a fabricated trend.
export function outstandingTotal(invoices: ApiInvoice[]): number {
  return invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.total, 0);
}

// Revenue collected in the current calendar month, from settled transactions
// only. `now` is the app's shared clock so the month boundary stays testable
// and consistent with the rest of the UI.
export function revenueThisMonth(
  transactions: ApiTransaction[],
  now: number,
): number {
  const ref = new Date(now);
  const month = ref.getMonth();
  const year = ref.getFullYear();
  return transactions
    .filter((t) => PAID_STATES.has(t.status) && t.createdAt)
    .filter((t) => {
      const d = new Date(t.createdAt as string);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

// Transactions that represent money that actually settled and carry a date.
// Every aggregate below builds on this so a pending/refunded/undated row can
// never inflate a client's revenue figures.
export function settledTransactions(
  transactions: ApiTransaction[],
): ApiTransaction[] {
  return transactions.filter((t) => PAID_STATES.has(t.status) && t.createdAt);
}

// Sum of settled transactions in one specific calendar month.
function sumMonth(
  transactions: ApiTransaction[],
  year: number,
  month: number,
): number {
  return settledTransactions(transactions)
    .filter((t) => {
      const d = new Date(t.createdAt as string);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

// The last `months` calendar months ending with the month of `now`, oldest
// first, each carrying the settled revenue for that month. Real sums only;
// months with no revenue are honest zeros, not interpolated. `now` is the app's
// shared clock so the window stays testable and consistent with the rest of the
// UI.
export function revenueTrend(
  transactions: ApiTransaction[],
  now: number,
  months = 12,
): { m: string; v: number }[] {
  const ref = new Date(now);
  const buckets: { key: string; m: string; v: number }[] = [];
  const index = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    // new Date(y, monthIndex, 1) normalizes underflowing month indices for us.
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    index.set(key, buckets.length);
    buckets.push({ key, m: MONTH_LABELS[d.getMonth()], v: 0 });
  }
  for (const t of settledTransactions(transactions)) {
    const d = new Date(t.createdAt as string);
    const at = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (at !== undefined) buckets[at].v += t.amount;
  }
  return buckets.map((b) => ({ m: b.m, v: Math.round(b.v) }));
}

// Revenue collected in the calendar month before now's month.
export function lastMonthRevenue(
  transactions: ApiTransaction[],
  now: number,
): number {
  const prev = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - 1, 1);
  return sumMonth(transactions, prev.getFullYear(), prev.getMonth());
}

// Month-over-month change as a rounded percentage. Returns 0 when there is no
// prior-month baseline (a percentage against zero is meaningless, so the UI
// simply shows no delta rather than a fabricated one).
export function momChangePct(
  transactions: ApiTransaction[],
  now: number,
): number {
  const current = revenueThisMonth(transactions, now);
  const previous = lastMonthRevenue(transactions, now);
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Total settled revenue in the current calendar year.
export function collectedYtd(
  transactions: ApiTransaction[],
  now: number,
): number {
  const year = new Date(now).getFullYear();
  return settledTransactions(transactions)
    .filter((t) => new Date(t.createdAt as string).getFullYear() === year)
    .reduce((sum, t) => sum + t.amount, 0);
}

// Mean total of paid invoices. Returns 0 when none are paid (never a fabricated
// average). Uses invoice totals, the truest per-job value the client sees.
export function avgPaidInvoice(invoices: ApiInvoice[]): number {
  const paid = invoices.filter((i) => i.status === "paid");
  if (paid.length === 0) return 0;
  return Math.round(paid.reduce((sum, i) => sum + i.total, 0) / paid.length);
}

// The top customers by settled revenue: grouped by contact name, summed, and
// ranked. `jobs` is the count of settled payments for that customer (the best
// proxy the payments feed offers). Colors are assigned by the caller, not here.
export function topCustomers(
  transactions: ApiTransaction[],
  n = 5,
): { name: string; jobs: number; amount: number }[] {
  const byName = new Map<string, { name: string; jobs: number; amount: number }>();
  for (const t of settledTransactions(transactions)) {
    const name = t.contactName?.trim() || "Unknown";
    const row = byName.get(name) ?? { name, jobs: 0, amount: 0 };
    row.jobs += 1;
    row.amount += t.amount;
    byName.set(name, row);
  }
  return [...byName.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((r) => ({ ...r, amount: Math.round(r.amount) }));
}
