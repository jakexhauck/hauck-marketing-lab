import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatCompact, formatMoney, formatMultiple, formatNumber, formatPercent } from "../../lib/format";
import { StatusPill } from "../ui";
import type { StatusMeta } from "../../lib/status";
import { cpl, ctr, roas, type Campaign, type CampaignStatus } from "../../lib/adsData";

const STATUS_META: Record<CampaignStatus, StatusMeta> = {
  active: { tone: "positive", label: "Active" },
  learning: { tone: "warning", label: "Learning" },
  paused: { tone: "neutral", label: "Paused" },
};

// DOM order is fixed; CSS hides columns at small widths and the grid track count
// changes in lockstep so visible cells always fill their tracks (display:none
// cells claim no track). Spend and CPL carry the gold money spine; ROAS, the
// headline efficiency figure, stays visible at every width.
const COLS =
  "grid-cols-[minmax(0,1.4fr)_auto_auto] sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto] md:grid-cols-[minmax(0,1.4fr)_auto_auto_auto_auto_auto] lg:grid-cols-[minmax(0,1.4fr)_repeat(7,auto)]";

type SortKey = "spend" | "leads" | "cpl" | "ctr" | "roas" | "impressions";

const SORT_VALUE: Record<SortKey, (c: Campaign) => number> = {
  spend: (c) => c.metrics.spend,
  leads: (c) => c.metrics.leads,
  impressions: (c) => c.metrics.impressions,
  cpl: (c) => cpl(c.metrics) ?? Infinity,
  ctr: (c) => ctr(c.metrics) ?? 0,
  roas: (c) => roas(c.metrics) ?? 0,
};

function Head({
  children,
  className,
  sortKey,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  className?: string;
  sortKey?: SortKey;
  active?: boolean;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
}) {
  if (!sortKey) return <div className={cn("label-cap", className)}>{children}</div>;
  return (
    <button
      type="button"
      onClick={() => onSort?.(sortKey)}
      className={cn(
        "label-cap inline-flex items-center gap-1 transition-colors hover:text-text",
        active && "text-text",
        className,
      )}
    >
      {children}
      {active &&
        (dir === "asc" ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />)}
    </button>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("font-data text-[13px] tnum", className)}>{children}</div>;
}

export function CampaignsTable({ campaigns }: { campaigns: Campaign[] }) {
  const [sort, setSort] = useState<SortKey>("spend");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const onSort = (k: SortKey) => {
    if (k === sort) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(k);
      // Cost metrics read best ascending (cheapest first); volume metrics descending.
      setDir(k === "cpl" ? "asc" : "desc");
    }
  };

  const rows = useMemo(() => {
    const get = SORT_VALUE[sort];
    return [...campaigns].sort((a, b) => (dir === "asc" ? get(a) - get(b) : get(b) - get(a)));
  }, [campaigns, sort, dir]);

  const headProps = (k: SortKey) => ({ sortKey: k, active: sort === k, dir, onSort });

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className={cn("grid items-center gap-3 border-b border-divider bg-surface-2/80 px-4 py-2.5 backdrop-blur", COLS)}>
        <Head>Campaign</Head>
        <Head className="hidden justify-start sm:flex">Status</Head>
        <Head className="justify-end text-right" {...headProps("spend")}>Spend</Head>
        <Head className="hidden justify-end text-right md:flex" {...headProps("leads")}>Leads</Head>
        <Head className="hidden justify-end text-right md:flex" {...headProps("cpl")}>Cost / lead</Head>
        <Head className="hidden justify-end text-right lg:flex" {...headProps("ctr")}>CTR</Head>
        <Head className="hidden justify-end text-right lg:flex" {...headProps("impressions")}>Impr.</Head>
        <Head className="justify-end text-right" {...headProps("roas")}>ROAS</Head>
      </div>

      {/* Rows */}
      <div className="divide-y divide-divider">
        {rows.map((c) => {
          const m = c.metrics;
          const meta = STATUS_META[c.status];
          const r = roas(m);
          return (
            <div key={c.id} className={cn("grid items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50", COLS)}>
              {/* Campaign */}
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-text">{c.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-faint">
                  <span>{c.objective}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{c.audience}</span>
                </div>
              </div>

              <div className="hidden sm:block">
                <StatusPill meta={meta} />
              </div>

              <Cell className="text-right ledger text-[13.5px]">{formatMoney(m.spend)}</Cell>
              <Cell className="hidden text-right text-text md:block">{formatNumber(m.leads)}</Cell>
              <Cell className="hidden text-right ledger text-[13.5px] md:block">
                {formatMoney(cpl(m), { cents: true })}
              </Cell>
              <Cell className="hidden text-right text-muted lg:block">{formatPercent(ctr(m))}</Cell>
              <Cell className="hidden text-right text-muted lg:block">{formatCompact(m.impressions)}</Cell>
              <Cell
                className={cn(
                  "text-right text-[13.5px] font-semibold",
                  r != null && r >= 1 ? "text-positive" : "text-danger",
                )}
              >
                {formatMultiple(r)}
              </Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}
