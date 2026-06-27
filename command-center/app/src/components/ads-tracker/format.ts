// Formatting helpers for the paid-ads tracker. Currency is GBP, matching the
// source sheet. Kept tiny and local so the tracker reads consistently.

export function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

// Money with pennies, for per-lead / per-booking costs.
export function gbp2(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function roasX(n: number): string {
  return `${n.toFixed(2)}x`;
}

export function intNum(n: number): string {
  return n.toLocaleString("en-GB");
}
