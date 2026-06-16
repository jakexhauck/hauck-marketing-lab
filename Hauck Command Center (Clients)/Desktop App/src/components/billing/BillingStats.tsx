import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui";

// The ledger band: a balance-sheet row across the top of Billing. Each cell is a
// labelled figure, money rendered in the gold ledger treatment. Counts stay in
// the neutral data face so gold means money and only money.

export interface BillingStat {
  label: string;
  // A money figure, gold ledger. Mutually exclusive with `count` per cell.
  money?: number;
  currency?: string;
  // A plain count, neutral data face (e.g. number of overdue invoices).
  count?: number;
  // Small caption under the figure (e.g. "3 invoices").
  caption?: ReactNode;
  // Tone of the caption text for light semantic signalling (no gold misuse).
  captionTone?: "muted" | "warning" | "danger" | "positive";
}

const CAPTION_TONE = {
  muted: "text-faint",
  warning: "text-warning",
  danger: "text-danger",
  positive: "text-positive",
} as const;

function StatCell({ stat }: { stat: BillingStat }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="label-cap">{stat.label}</div>
      {stat.money != null ? (
        <div className="ledger text-[22px] leading-none sm:text-[26px]">
          {formatMoney(stat.money, { currency: stat.currency })}
        </div>
      ) : (
        <div className="font-data text-[22px] leading-none text-text tnum sm:text-[26px]">
          {stat.count ?? 0}
        </div>
      )}
      {stat.caption != null && (
        <div className={cn("font-data text-[11.5px]", CAPTION_TONE[stat.captionTone ?? "muted"])}>
          {stat.caption}
        </div>
      )}
    </div>
  );
}

export function BillingStats({ stats }: { stats: BillingStat[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-divider overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] sm:grid-cols-4 sm:divide-y-0">
      {stats.map((stat) => (
        <StatCell key={stat.label} stat={stat} />
      ))}
    </div>
  );
}

export function BillingStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-divider overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] sm:grid-cols-4 sm:divide-y-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-3.5 sm:px-5 sm:py-4">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}
