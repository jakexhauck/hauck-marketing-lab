export function formatMoney(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "-";
  if (n === 0) return "$0";
  const negative = n < 0;
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1_000_000) {
    body = `$${(abs / 1_000_000).toFixed(1)}M`;
  } else if (abs >= 1_000) {
    const k = abs / 1_000;
    // Switch to whole-k format once the value rounds to >= 10.0k, so $9,999
    // reads "$10k" (consistent with $10,000) rather than "$10.0k". Using the raw
    // `k >= 10` boundary let toFixed(1) round 9.95-9.999 up to "10.0k".
    body = k >= 9.95 ? `$${Math.round(k)}k` : `$${k.toFixed(1)}k`;
  } else {
    body = `$${Math.round(abs).toLocaleString("en-US")}`;
  }
  return negative ? `-${body}` : body;
}

// Full, non-rounded value with thousands separators and no cents, e.g.
// "$4,250", "$0", "-" for null. Used for per-lead figures on cards, where the
// compact formatMoney ("$4.3k") reads as imprecise on a client's real values.
// Aggregate totals keep using formatMoney.
export function formatMoneyExact(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "-";
  const rounded = Math.round(n);
  if (rounded === 0) return "$0";
  const negative = rounded < 0;
  const body = `$${Math.abs(rounded).toLocaleString("en-US")}`;
  return negative ? `-${body}` : body;
}

export function formatRoas(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "-";
  return `${n.toFixed(1)}×`;
}
