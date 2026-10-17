// Meta budgets are whole numbers in the ad account currency's smallest unit,
// by Meta's own offset per currency: 100 for most (cents, so 4000 is $40.00),
// 1 for the currencies Meta counts without decimals (4000 is 4000 yen).
// Shared by the Ads Agent's server checks (functions/lib/agentMetaOps.ts) and
// its cards (agentView.ts), so the guard and the words use the same unit.

// Meta's offset-1 currencies (Ads Manager currency list).
const ZERO_DECIMAL = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

export const isCurrencyCode = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{3}$/.test(v);

export function currencyOffset(code: string): number {
  return ZERO_DECIMAL.has(code.toUpperCase()) ? 1 : 100;
}

/** A budget in Meta's units as words: "$40.00" for USD, "40.00 EUR", "4000 JPY". */
export function formatBudget(minor: number, code = "USD"): string {
  const c = code.toUpperCase();
  const offset = currencyOffset(c);
  const major = offset === 1 ? String(minor) : (minor / offset).toFixed(2);
  return c === "USD" ? `$${major}` : `${major} ${c}`;
}
