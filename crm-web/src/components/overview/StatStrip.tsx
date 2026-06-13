import type { ReactNode } from "react";
import { Panel, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney, formatNumber } from "@/lib/format";
import type { ApiSummary } from "@hauck/core";

// A single read-only metric cell. Counts render in font-data; money in ledger.
function Stat({
  label,
  value,
  tone = "data",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "data" | "ledger";
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3.5">
      <span className="label-cap truncate">{label}</span>
      <span
        className={cn(
          "text-[22px] leading-none tnum",
          tone === "ledger" ? "ledger" : "font-data text-text",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </div>
  );
}

export function StatStripSkeleton({ cells = 5 }: { cells?: number }) {
  return (
    <Panel className="grid grid-cols-2 divide-y divide-divider sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-3.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </Panel>
  );
}

export function StatStrip({
  summary,
  monthlySpend,
}: {
  summary: ApiSummary;
  monthlySpend: number | null;
}) {
  const openLeads = summary.pipelines.reduce((sum, p) => sum + p.open, 0);
  const totalLeads = summary.pipelines.reduce((sum, p) => sum + p.total, 0);

  // Only real, returned figures. No derived ratios.
  const cells: { label: string; value: ReactNode; tone?: "data" | "ledger"; hint?: string }[] = [
    { label: "New today", value: formatNumber(summary.newToday) },
    { label: "Unread", value: formatNumber(summary.unreadConversations), hint: "conversations" },
    { label: "Open leads", value: formatNumber(openLeads) },
    { label: "Total leads", value: formatNumber(totalLeads) },
    { label: "Pipelines", value: formatNumber(summary.pipelines.length) },
  ];

  if (monthlySpend != null) {
    cells.push({
      label: "Monthly spend",
      value: formatMoney(monthlySpend),
      tone: "ledger",
    });
  }

  return (
    <Panel
      className={cn(
        "grid grid-cols-2 divide-x divide-y divide-divider sm:grid-cols-3",
        cells.length > 5 ? "lg:grid-cols-6" : "lg:grid-cols-5",
        "lg:divide-y-0",
      )}
    >
      {cells.map((c) => (
        <Stat key={c.label} {...c} />
      ))}
    </Panel>
  );
}
