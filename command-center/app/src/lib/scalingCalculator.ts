// The scaling calculator: seven hand-entered numbers in, one protected daily
// target out. Pure math, no React and no formatting side effects, so the whole
// derivation stays unit-tested (scalingCalculator.test.ts) and the component is
// only a view.
//
// The chain, exactly as the approved mockup computes it:
//   gap      = goal - current revenue (never negative)
//   clients  = gap / avg cash per close
//   shows    = clients / closing %
//   calls    = shows / show rate %
//   monthly  = calls / booking rate %
//   daily    = monthly / 30
//
// Offer Price is captured and persisted for reference but is deliberately not
// part of the derivation: the divisor is Avg Cash / Close.

// The seven inputs. Percentages are whole numbers as typed (20 = 20%); this
// module divides by 100. Matches the scaling_calculator table one to one.
export interface ScalingInputs {
  currentRevenue: number;
  monthlyCashGoal: number;
  offerPrice: number;
  avgCashClose: number;
  closingPct: number;
  showRatePct: number;
  bookingRatePct: number;
}

// Raw, unrounded results. Rounding happens only at display, via formatScaling:
// rounding an intermediate (calls 83.33 -> 83) drifts the daily number.
export interface ScalingOutputs {
  gap: number;
  newClientsNeeded: number;
  callsShowsNeeded: number;
  totalCallsNeeded: number;
  totalMonthlyInput: number;
  totalDailyInput: number;
}

// Mirrors the migration defaults (0030_scaling_calculator.sql) so a missing row
// and a fresh page render the same numbers.
export const DEFAULT_INPUTS: ScalingInputs = {
  currentRevenue: 0,
  monthlyCashGoal: 10000,
  offerPrice: 1000,
  avgCashClose: 1000,
  closingPct: 20,
  showRatePct: 60,
  bookingRatePct: 2,
};

// The month is treated as a flat 30 days: this is a target, not a calendar.
export const DAYS_PER_MONTH = 30;

// Every division guards its denominator so a blank or zeroed field yields 0
// instead of Infinity / NaN cascading down the chain.
function divide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function computeScaling(inputs: ScalingInputs): ScalingOutputs {
  const closing = inputs.closingPct / 100;
  const show = inputs.showRatePct / 100;
  const booking = inputs.bookingRatePct / 100;

  const gap = Math.max(inputs.monthlyCashGoal - inputs.currentRevenue, 0);
  const newClientsNeeded = divide(gap, inputs.avgCashClose);
  const callsShowsNeeded = divide(newClientsNeeded, closing);
  const totalCallsNeeded = divide(callsShowsNeeded, show);
  const totalMonthlyInput = divide(totalCallsNeeded, booking);
  const totalDailyInput = totalMonthlyInput / DAYS_PER_MONTH;

  return {
    gap,
    newClientsNeeded,
    callsShowsNeeded,
    totalCallsNeeded,
    totalMonthlyInput,
    totalDailyInput,
  };
}

// Display formatting for a computed output: whole numbers with thousands
// grouping ("4,167", "139"). You cannot make a third of a call.
export function formatScaling(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}
