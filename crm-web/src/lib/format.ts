// Display formatters. Money and counts lean on the mono "ledger" treatment in
// the markup; these just produce the strings.

export function formatMoney(
  value: number | null | undefined,
  opts: { currency?: string; cents?: boolean } = {},
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const currency = opts.currency ?? "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

const REL_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function relativeTime(input: string | number | Date | null | undefined): string {
  if (input == null) return "—";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const division of REL_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return "—";
}

export function formatDate(
  input: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string {
  if (input == null) return "—";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", opts).format(date);
}

export function formatTime(input: string | number | Date | null | undefined): string {
  return formatDate(input, { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(input: string | number | Date | null | undefined): string {
  return formatDate(input, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  const m = /^\+?1?(\d{3})(\d{3})(\d{4})$/.exec(digits.replace(/^\+/, ""));
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return phone;
}

// Deterministic accent index for avatars from a string seed.
export function hashIndex(seed: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % buckets;
}
