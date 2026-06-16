import { useMemo, useState } from "react";
import type { ApiLead, ApiPipelineSummary } from "@hauck/core";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui";
import { LeadCard } from "./LeadCard";
import { LedgerValue, sumValues } from "./money";

interface BoardProps {
  pipeline: ApiPipelineSummary;
  leads: ApiLead[];
  onOpenLead: (id: string) => void;
  onMove: (leadId: string, pipelineStageId: string) => void;
}

// Native HTML5 drag-and-drop kanban. No dependency: cards are draggable, columns
// are drop zones keyed by stage id. The move hook upstream is optimistic, so the
// card appears in its new column the moment it is dropped.
export function Board({ pipeline, leads, onOpenLead, onMove }: BoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map = new Map<string, ApiLead[]>();
    for (const stage of pipeline.stages) map.set(stage.id, []);
    for (const lead of leads) {
      const bucket = map.get(lead.pipelineStageId);
      if (bucket) bucket.push(lead);
      // Leads whose stage is not part of this pipeline are dropped from the board
      // rather than shown in a phantom column.
    }
    return map;
  }, [pipeline.stages, leads]);

  function handleDrop(stageId: string) {
    const id = draggingId;
    setOverStageId(null);
    setDraggingId(null);
    if (id) onMove(id, stageId);
  }

  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2">
      <div className="flex min-h-[calc(100vh-220px)] gap-3">
        {pipeline.stages.map((stage) => {
          const stageLeads = byStage.get(stage.id) ?? [];
          const total = sumValues(stageLeads.map((l) => l.value));
          const isOver = overStageId === stage.id;
          return (
            <section
              key={stage.id}
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overStageId !== stage.id) setOverStageId(stage.id);
              }}
              onDragLeave={(e) => {
                // Only clear when the pointer actually leaves the column, not when
                // it crosses a child element inside it.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOverStageId((s) => (s === stage.id ? null : s));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage.id);
              }}
              className={cn(
                "flex w-[268px] shrink-0 flex-col rounded-[var(--radius-lg)] border bg-rail/60 transition-colors",
                isOver ? "border-brand ring-2 ring-[var(--ring)]" : "border-border",
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-[12.5px] font-semibold text-text">{stage.name}</h3>
                  <span className="font-data text-[11px] text-faint tnum">{stageLeads.length}</span>
                </div>
                {total != null && <LedgerValue value={total} className="text-[11.5px]" />}
              </header>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
                {stageLeads.length === 0 ? (
                  <div
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-[var(--radius)] border border-dashed px-3 py-8 text-center text-[12px] transition-colors",
                      isOver ? "border-brand text-brand-text" : "border-border text-faint",
                    )}
                  >
                    {isOver ? "Drop here" : "No leads"}
                  </div>
                ) : (
                  stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      dragging={draggingId === lead.id}
                      onOpen={() => onOpenLead(lead.id)}
                      onDragStart={() => setDraggingId(lead.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStageId(null);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// Skeleton columns shown while the first page of leads loads.
export function BoardSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2">
      <div className="flex gap-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex w-[268px] shrink-0 flex-col rounded-[var(--radius-lg)] border border-border bg-rail/60">
            <div className="flex items-center justify-between border-b border-divider px-3 py-2.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-8" />
            </div>
            <div className="flex flex-col gap-2 p-2.5">
              {Array.from({ length: 3 }).map((__, j) => (
                <Skeleton key={j} className="h-[78px] w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
