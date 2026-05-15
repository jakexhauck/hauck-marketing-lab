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
    body = k >= 10 ? `$${Math.round(k)}k` : `$${k.toFixed(1)}k`;
  } else {
    body = `$${Math.round(abs).toLocaleString("en-US")}`;
  }
  return negative ? `-${body}` : body;
}

export function formatRoas(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "-";
  return `${n.toFixed(1)}×`;
}
