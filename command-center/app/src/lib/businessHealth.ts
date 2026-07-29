// Business Health (the admin Command home): pure derivations and benchmark
// thresholds. Everything numeric on the dashboard lives here so the component
// stays presentational and the maths is unit-tested. No React, no I/O.
//
// Phase 1 is hand entry: the ten inputs below are typed by Jake and saved per
// period. The "Auto" tiles (CAC, ROAS, Avg LTV, LTV:CAC, End clients) are pure
// functions of those inputs, recomputed live as you type. They are NOT stored
// (they would drift) and NOT auto-filled from GHL/Meta (that is Phase 2).

export type PeriodType = "month" | "quarter" | "year";
export type Tone = "ok" | "watch" | "bad";

export interface BenchResult {
  tone: Tone;
  label: string;
}

// The ten manually-entered fields. camelCase; the API maps these to snake_case
// columns. numeric so percents and decimals stay exact.
export interface BusinessHealthInputs {
  marketingSpend: number; // feeds CAC and ROAS
  newRevenue: number; // first-order revenue
  newMrr: number; // recurring revenue added
  startClients: number; // active at period start
  newClients: number; // signed this period
  churnedClients: number; // lost this period
  profitMarginPct: number; // after delivery cost, 0-100
  avgRetentionMonths: number; // how long clients stay
  avgRevenuePerClient: number; // average monthly billing
  churnPct: number; // monthly logo churn, 0-100
}

// The all-zero template an unsaved period shows (honest empty state, never
// fabricated numbers).
export const ZERO_INPUTS: BusinessHealthInputs = {
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

// Period key from a date (default: now). One row per key, so the key is the
// upsert identity:
//   month   -> "2026-07"
//   quarter -> "2026-Q3"
//   year    -> "2026"
export function periodKey(type: PeriodType, d = new Date()): string {
  const y = d.getFullYear();
  if (type === "year") return String(y);
  if (type === "quarter") return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`; // month
}

export interface Computed {
  cac: number;
  roas: number;
  avgLtv: number;
  ltvCac: number;
  endClients: number;
}

// The live-computed tiles. Divide-by-zero guards return 0 (an honest "no data
// yet") rather than Infinity/NaN.
export function computeMetrics(i: BusinessHealthInputs): Computed {
  const cac = i.newClients > 0 ? i.marketingSpend / i.newClients : 0;
  const roas = i.marketingSpend > 0 ? i.newRevenue / i.marketingSpend : 0;
  const avgLtv = i.avgRevenuePerClient * i.avgRetentionMonths * (i.profitMarginPct / 100);
  const ltvCac = cac > 0 ? avgLtv / cac : 0;
  const endClients = i.startClients + i.newClients - i.churnedClients;
  return { cac, roas, avgLtv, ltvCac, endClients };
}

export type BenchmarkKind = "cac" | "ltvCac" | "roas" | "churn" | "margin";

// Benchmark chips. Thresholds are the agency's own targets (ported verbatim
// from the approved mockup). Boundaries are inclusive exactly as written below.
export function benchmark(kind: BenchmarkKind, v: number): BenchResult {
  switch (kind) {
    case "cac":
      return v < 1000
        ? { tone: "ok", label: "target <$1k" }
        : { tone: "bad", label: "over $1k" };
    case "ltvCac":
      return v >= 3
        ? { tone: "ok", label: "healthy >3x" }
        : v >= 1
          ? { tone: "watch", label: "watch 1-3x" }
          : { tone: "bad", label: "below 1x" };
    case "roas":
      return v >= 3
        ? { tone: "ok", label: "good >3x" }
        : v >= 1
          ? { tone: "watch", label: "thin 1-3x" }
          : { tone: "bad", label: "losing money" };
    case "churn":
      return v < 8
        ? { tone: "ok", label: "low <8%" }
        : v <= 15
          ? { tone: "watch", label: "watch" }
          : { tone: "bad", label: "high >15%" };
    case "margin":
      return v >= 25
        ? { tone: "ok", label: "healthy" }
        : v >= 10
          ? { tone: "watch", label: "thin" }
          : { tone: "bad", label: "low" };
  }
}
