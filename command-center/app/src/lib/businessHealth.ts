// Business Health (the Command home) pure logic: period identity, the derived
// unit economics, and the benchmark thresholds behind the chips.
//
// Nothing numeric lives in the component. Every value below is a pure function
// of the ten hand-entered inputs, which is exactly why the computed metrics are
// NOT stored in the database: they would drift the moment an input changed.
//
// Phase 1 is manual entry, so "Auto" on a tile means "computed from the other
// inputs", not "pulled from GHL/Meta". Auto-fill from live sources is Phase 2.

export type PeriodType = "month" | "quarter" | "year";

// The ten manual inputs, one row per period key in public.business_health.
export interface BusinessHealthInputs {
  marketingSpend: number;
  newRevenue: number;
  newMrr: number;
  startClients: number;
  newClients: number;
  churnedClients: number;
  profitMarginPct: number;
  avgRetentionMonths: number;
  avgRevenuePerClient: number;
  churnPct: number;
}

// A period that has never been saved opens as all-zeros rather than fabricated
// numbers. The API returns this same shape for a missing row.
export const EMPTY_INPUTS: BusinessHealthInputs = {
  marketingSpend: 0,
  newRevenue: 0,
  newMrr: 0,
  startClients: 0,
  newClients: 0,
  churnedClients: 0,
  profitMarginPct: 0,
  avgRetentionMonths: 0,
  avgRevenuePerClient: 0,
  churnPct: 0,
};

// Period key from a date (default: now). One row per key, so the key IS the
// period identity: "2026-07", "2026-Q3", "2026".
export function periodKey(type: PeriodType, d = new Date()): string {
  const y = d.getFullYear();
  if (type === "year") return String(y);
  if (type === "quarter") return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface Computed {
  cac: number;
  roas: number;
  avgLtv: number;
  ltvCac: number;
  endClients: number;
}

// Every divisor is guarded: an empty period divides by zero everywhere, and 0
// is the honest answer there (no clients acquired means no cost per client).
export function computeMetrics(i: BusinessHealthInputs): Computed {
  const cac = i.newClients > 0 ? i.marketingSpend / i.newClients : 0;
  const roas = i.marketingSpend > 0 ? i.newRevenue / i.marketingSpend : 0;
  const avgLtv = i.avgRevenuePerClient * i.avgRetentionMonths * (i.profitMarginPct / 100);
  const ltvCac = cac > 0 ? avgLtv / cac : 0;
  const endClients = i.startClients + i.newClients - i.churnedClients;
  return { cac, roas, avgLtv, ltvCac, endClients };
}

export type Tone = "ok" | "watch" | "bad";
export interface BenchResult {
  tone: Tone;
  label: string;
}

export type BenchKind = "cac" | "ltvCac" | "roas" | "churn" | "margin";

// Benchmark chips. Thresholds are the agency's own targets, carried over from
// the approved mockup so the chip flips at the same number the design showed.
export function benchmark(kind: BenchKind, v: number): BenchResult {
  switch (kind) {
    case "cac":
      return v < 1000 ? { tone: "ok", label: "target <$1k" } : { tone: "bad", label: "over $1k" };
    case "ltvCac":
      if (v >= 3) return { tone: "ok", label: "healthy >3x" };
      return v >= 1 ? { tone: "watch", label: "watch 1-3x" } : { tone: "bad", label: "below 1x" };
    case "roas":
      if (v >= 3) return { tone: "ok", label: "good >3x" };
      return v >= 1 ? { tone: "watch", label: "thin 1-3x" } : { tone: "bad", label: "losing money" };
    case "churn":
      if (v < 8) return { tone: "ok", label: "low <8%" };
      return v <= 15 ? { tone: "watch", label: "watch" } : { tone: "bad", label: "high >15%" };
    case "margin":
      if (v >= 25) return { tone: "ok", label: "healthy" };
      return v >= 10 ? { tone: "watch", label: "thin" } : { tone: "bad", label: "low" };
  }
}

// Ratio display for the LTV:CAC and ROAS tiles ("4.9x").
export function formatRatio(v: number): string {
  return `${v.toFixed(1)}x`;
}
