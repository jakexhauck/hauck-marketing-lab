import { Tag } from "lucide-react";
import type { ApiLead } from "@hauck/core";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { leadStatus } from "@/lib/status";
import { StatusPill } from "@/components/ui";
import { LedgerValue } from "./money";

// A draggable kanban card. The parent owns the drag/drop wiring (onDragStart /
// dragging flag) so the column can manage drop targeting; this stays presentational.
export function LeadCard({
  lead,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  lead: ApiLead;
  dragging?: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const status = leadStatus(lead.status);
  return (
    <button
      type="button"
      draggable
      onClick={onOpen}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group block w-full cursor-grab rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-left",
        "shadow-[var(--shadow-sm)] transition-colors hover:border-border-strong active:cursor-grabbing",
        "focus-visible:border-brand focus-visible:outline-none",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-tight text-text">
          {lead.name || "Unnamed lead"}
        </span>
        <LedgerValue value={lead.value} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusPill meta={status} />
        <span className="font-data text-[11px] text-faint">{relativeTime(lead.lastActivityAt)}</span>
      </div>

      {lead.tags && lead.tags.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-faint">
          <Tag size={11} className="shrink-0" />
          <span className="truncate text-[11px] text-muted">{lead.tags.slice(0, 3).join(", ")}</span>
        </div>
      )}
    </button>
  );
}
