import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ApiLead, ApiPipelineSummary } from "@hauck/core";
import { cn } from "@/lib/cn";
import { formatDate, relativeTime } from "@/lib/format";
import { leadStatus } from "@/lib/status";
import { Avatar, StatusPill, Skeleton } from "@/components/ui";
import { LedgerValue } from "./money";

type SortKey = "name" | "stage" | "value" | "created" | "lastActivity";
type SortDir = "asc" | "desc";

function compare(a: ApiLead, b: ApiLead, key: SortKey, stageName: (id: string) => string): number {
  switch (key) {
    case "name":
      return (a.name || "").localeCompare(b.name || "");
    case "stage":
      return stageName(a.pipelineStageId).localeCompare(stageName(b.pipelineStageId));
    case "value":
      // Unset values sort below any real number regardless of direction intent;
      // the caller flips the sign for descending.
      return (a.value ?? -1) - (b.value ?? -1);
    case "created":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    case "lastActivity":
      return new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime();
  }
}

export function LeadTable({
  pipeline,
  leads,
  onOpenLead,
}: {
  pipeline: ApiPipelineSummary;
  leads: ApiLead[];
  onOpenLead: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const stageName = useMemo(() => {
    const map = new Map(pipeline.stages.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "Unstaged";
  }, [pipeline.stages]);

  const sorted = useMemo(() => {
    const rows = [...leads];
    rows.sort((a, b) => {
      const c = compare(a, b, sortKey, stageName);
      return sortDir === "asc" ? c : -c;
    });
    return rows;
  }, [leads, sortKey, sortDir, stageName]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text columns default to A→Z, numeric/date columns to newest/highest first.
      setSortDir(key === "name" || key === "stage" ? "asc" : "desc");
    }
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="border-b border-border">
              <Th label="Name" sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Stage" sortKey="stage" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="label-cap whitespace-nowrap px-3 py-2.5">Status</th>
              <Th label="Value" sortKey="value" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <Th label="Created" sortKey="created" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Last activity" sortKey="lastActivity" active={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => onOpenLead(lead.id)}
                className="cursor-pointer border-b border-divider last:border-0 transition-colors hover:bg-surface-2/60"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={lead.name} size="sm" />
                    <span className="truncate text-[13.5px] font-medium text-text">
                      {lead.name || "Unnamed lead"}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-muted">
                  {stageName(lead.pipelineStageId)}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill meta={leadStatus(lead.status)} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <LedgerValue value={lead.value} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-data text-[12px] text-muted">
                  {formatDate(lead.createdAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-data text-[12px] text-faint">
                  {relativeTime(lead.lastActivityAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const on = active === sortKey;
  return (
    <th className={cn("whitespace-nowrap px-3 py-2.5", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "label-cap inline-flex items-center gap-1 transition-colors hover:text-text",
          align === "right" && "flex-row-reverse",
          on && "text-text",
        )}
      >
        {label}
        {on ? (
          dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <span className="w-3" aria-hidden />
        )}
      </button>
    </th>
  );
}

export function LeadTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="border-b border-border bg-surface-2 px-3 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-divider">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
