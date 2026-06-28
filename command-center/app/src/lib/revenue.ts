import type { ApiInvoice, ApiTransaction } from "./api";

// Payment statuses GHL reports for money that actually settled.
const PAID_STATES = new Set(["succeeded", "paid", "completed", "success"]);

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
