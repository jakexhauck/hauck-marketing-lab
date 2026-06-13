import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

// Money is the only place gold appears in the cockpit. A null value is not a
// zero, it is "unset", so it reads as muted rather than as a ledger entry.
export function LedgerValue({
  value,
  className,
  emptyLabel = "no value",
}: {
  value: number | null | undefined;
  className?: string;
  emptyLabel?: string;
}) {
  if (value == null) {
    return <span className={cn("font-data text-[12px] text-faint", className)}>{emptyLabel}</span>;
  }
  return <span className={cn("ledger text-[13px]", className)}>{formatMoney(value)}</span>;
}

// Sum a list of lead values, ignoring nulls. Returns null when nothing is set so
// the caller can choose to hide an empty total instead of showing $0.
export function sumValues(values: (number | null | undefined)[]): number | null {
  let any = false;
  let total = 0;
  for (const v of values) {
    if (v != null && !Number.isNaN(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}
