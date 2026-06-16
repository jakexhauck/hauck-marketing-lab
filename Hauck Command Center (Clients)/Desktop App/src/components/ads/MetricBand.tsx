import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

// A read-only metric cell used across the Paid Ads surface. Money renders in the
// gold ledger face; everything else (counts, rates, multiples) in the neutral
// data face — so gold keeps meaning "money" and only money.
export interface MetricCell {
  label: string;
  // Pre-formatted display string (formatting lives at the call site so each cell
  // can pick money / percent / multiple).
  value: string;
  tone?: "ledger" | "data";
  // Signed change vs the comparable prior window (0.12 = +12%). Null hides it.
  delta?: number | null;
  // Which direction is the "good" one. For cost metrics (CPL, CPC) a fall is
  // good, so the same downward arrow reads green instead of red. "neutral" keeps
  // the chip faint either way (e.g. spend, where up/down isn't good or bad).
  goodDirection?: "up" | "down" | "neutral";
  caption?: string;
}

function DeltaChip({
  delta,
  goodDirection = "up",
}: {
  delta: number;
  goodDirection?: "up" | "down" | "neutral";
}) {
  const flat = Math.abs(delta) < 0.0005;
  const rising = delta > 0;
  const isGood =
    flat || goodDirection === "neutral" ? null : rising ? goodDirection === "up" : goodDirection === "down";
  const Icon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-data text-[11px] tnum",
        isGood == null ? "text-faint" : isGood ? "text-positive" : "text-danger",
      )}
      title="vs previous period"
    >
      <Icon size={12} aria-hidden />
      {flat ? "0%" : formatPercent(Math.abs(delta), 1)}
    </span>
  );
}

function Cell({ cell }: { cell: MetricCell }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3.5 sm:px-5 sm:py-4">
      <span className="label-cap truncate">{cell.label}</span>
      <span
        className={cn(
          "text-[22px] leading-none sm:text-[25px]",
          cell.tone === "ledger" ? "ledger" : "font-data text-text tnum",
        )}
      >
        {cell.value}
      </span>
      <div className="flex items-center gap-2">
        {cell.delta != null && <DeltaChip delta={cell.delta} goodDirection={cell.goodDirection} />}
        {cell.caption && <span className="text-[11px] text-faint">{cell.caption}</span>}
      </div>
    </div>
  );
}

// A balance-sheet style band of metric cells. `cols` controls the desktop grid.
export function MetricBand({ cells, cols = 6 }: { cells: MetricCell[]; cols?: 4 | 5 | 6 }) {
  const lg = cols === 4 ? "lg:grid-cols-4" : cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-6";
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-x divide-y divide-divider overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] sm:grid-cols-3 sm:divide-y-0 lg:divide-y-0",
        lg,
      )}
    >
      {cells.map((c) => (
        <Cell key={c.label} cell={c} />
      ))}
    </div>
  );
}
