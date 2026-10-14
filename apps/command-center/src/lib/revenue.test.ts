import { describe, it, expect } from "vitest";
import {
  revenueThisMonth,
  outstandingTotal,
  settledTransactions,
  revenueTrend,
  lastMonthRevenue,
  momChangePct,
  collectedYtd,
  avgPaidInvoice,
  topCustomers,
} from "./revenue";
import type { ApiInvoice, ApiTransaction } from "./api";

// Build a settled transaction at local noon on the given date so the month/year
// bucket is stable regardless of the runner's timezone offset.
function tx(
  y: number,
  m: number,
  d: number,
  amount: number,
  contactName = "Someone",
  status = "succeeded",
): ApiTransaction {
  return {
    id: `${y}-${m}-${d}-${amount}-${contactName}`,
    amount,
    status,
    contactName,
    createdAt: new Date(y, m, d, 12, 0, 0).toISOString(),
    method: "card",
  };
}

function inv(total: number, status: string, paidY = 2026, paidM = 5): ApiInvoice {
  return {
    id: `inv-${total}-${status}`,
    number: "INV-1",
    contactName: "Someone",
    total,
    status,
    dueDate: null,
    paidAt: status === "paid" ? new Date(paidY, paidM, 10, 12).toISOString() : null,
  };
}

// Reference "now": June 15, 2026 (month index 5).
const NOW = new Date(2026, 5, 15).getTime();

describe("settledTransactions", () => {
  it("keeps only paid states with a timestamp", () => {
    const rows = [
      tx(2026, 5, 1, 100, "A", "succeeded"),
      tx(2026, 5, 2, 200, "B", "pending"),
      tx(2026, 5, 3, 300, "C", "refunded"),
      { ...tx(2026, 5, 4, 400, "D", "paid"), createdAt: null },
    ];
    const out = settledTransactions(rows);
    expect(out.map((t) => t.amount)).toEqual([100]);
  });
});

describe("revenueTrend", () => {
  it("returns one bucket per month ending on now's month, oldest first", () => {
    const out = revenueTrend([], NOW, 12);
    expect(out).toHaveLength(12);
    expect(out[out.length - 1].m).toBe("Jun");
    expect(out[0].m).toBe("Jul"); // 12 months back from June is last July
    expect(out.every((p) => p.v === 0)).toBe(true);
  });

  it("sums settled transactions into their month, ignoring older than the window", () => {
    const rows = [
      tx(2026, 5, 3, 1000), // June (current)
      tx(2026, 5, 20, 500), // June
      tx(2026, 4, 10, 700), // May
      tx(2024, 0, 1, 9999), // way outside the 12-month window
      tx(2026, 5, 9, 100, "X", "pending"), // not settled
    ];
    const out = revenueTrend(rows, NOW, 12);
    const june = out[out.length - 1];
    const may = out[out.length - 2];
    expect(june.v).toBe(1500);
    expect(may.v).toBe(700);
    expect(out.reduce((s, p) => s + p.v, 0)).toBe(2200); // 9999 excluded
  });
});

describe("lastMonthRevenue / revenueThisMonth / momChangePct", () => {
  const rows = [
    tx(2026, 5, 3, 1200), // this month (June)
    tx(2026, 4, 3, 1000), // last month (May)
    tx(2026, 4, 20, 500), // last month
  ];
  it("splits this vs last month", () => {
    expect(revenueThisMonth(rows, NOW)).toBe(1200);
    expect(lastMonthRevenue(rows, NOW)).toBe(1500);
  });
  it("computes MoM percentage, rounded", () => {
    // (1200 - 1500) / 1500 = -20%
    expect(momChangePct(rows, NOW)).toBe(-20);
  });
  it("returns 0 MoM when there is no last-month baseline", () => {
    expect(momChangePct([tx(2026, 5, 3, 1200)], NOW)).toBe(0);
  });
});

describe("collectedYtd", () => {
  it("sums settled transactions in the current calendar year only", () => {
    const rows = [
      tx(2026, 0, 5, 400),
      tx(2026, 5, 5, 600),
      tx(2025, 11, 31, 999), // prior year
    ];
    expect(collectedYtd(rows, NOW)).toBe(1000);
  });
});

describe("avgPaidInvoice", () => {
  it("averages the total of paid invoices only", () => {
    const invoices = [inv(1000, "paid"), inv(3000, "paid"), inv(5000, "sent")];
    expect(avgPaidInvoice(invoices)).toBe(2000);
  });
  it("returns 0 when there are no paid invoices", () => {
    expect(avgPaidInvoice([inv(5000, "sent")])).toBe(0);
  });
});

describe("topCustomers", () => {
  it("groups settled transactions by contact, sums amount, counts jobs, ranks desc", () => {
    const rows = [
      tx(2026, 5, 1, 1000, "Ada"),
      tx(2026, 4, 1, 500, "Ada"),
      tx(2026, 3, 1, 4000, "Bo"),
      tx(2026, 2, 1, 200, "Cy", "pending"), // dropped (not settled)
    ];
    const out = topCustomers(rows, 5);
    expect(out).toEqual([
      { name: "Bo", jobs: 1, amount: 4000 },
      { name: "Ada", jobs: 2, amount: 1500 },
    ]);
  });
  it("respects the limit", () => {
    const rows = [
      tx(2026, 5, 1, 5, "A"),
      tx(2026, 5, 1, 4, "B"),
      tx(2026, 5, 1, 3, "C"),
    ];
    expect(topCustomers(rows, 2).map((r) => r.name)).toEqual(["A", "B"]);
  });
});

// Guard the existing helper still behaves.
describe("outstandingTotal", () => {
  it("sums sent + overdue invoices", () => {
    expect(
      outstandingTotal([inv(100, "sent"), inv(200, "overdue"), inv(300, "paid")]),
    ).toBe(300);
  });
});
