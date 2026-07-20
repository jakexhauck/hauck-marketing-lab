import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import SetterCard from "./SetterCard";
import type { ApiSetterLead, ApiSetterPipeline } from "../../../lib/api";

interface Props {
  pipeline: ApiSetterPipeline;
  leads: ApiSetterLead[];
  truncated: boolean;
  now: number;
  selectedLeadId: string | null;
  onSelectLead: (lead: ApiSetterLead) => void;
}

// One pipeline's stage columns, real GHL stage names verbatim, structured
// exactly like the client-facing kanban (src/components/Board.tsx): a dot +
// name + count header, a needs-dialing chip under flagged stages, and a
// rounded well of cards. Unlike that board this one never hides a stage or a
// pipeline, and it groups by stage NAME (ApiSetterLead has no stage id, only
// stageName, since the leads endpoint resolves it live per lead).
export default function SetterBoard({
  pipeline,
  leads,
  truncated,
  now,
  selectedLeadId,
  onSelectLead,
}: Props) {
  const byStage = useMemo(() => {
    const m = new Map<string, ApiSetterLead[]>();
    for (const s of pipeline.stages) m.set(s.name, []);
    for (const l of leads) {
      const list = m.get(l.stageName);
      // A lead whose stage name has no matching column (stale cache, a stage
      // renamed between the pipeline and lead fetch) is dropped from the
      // board rather than crashing it; the count in its real stage stays
      // accurate for everything else.
      if (list) list.push(l);
    }
    return m;
  }, [leads, pipeline.stages]);

  return (
    <div className="pt-2">
      {truncated && (
        <div className="mx-1 mb-3 flex items-center gap-2 rounded-xl border border-warning/35 bg-warning-tint px-3 py-2 text-[12.5px] font-semibold text-warning">
          <AlertTriangle size={14} aria-hidden />
          Showing the first 1,000 leads in this pipeline. There are more that are not shown here.
        </div>
      )}

      <div className="no-scrollbar flex items-start gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((stage) => {
          const items = byStage.get(stage.name) ?? [];
          return (
            <section key={stage.id} className="flex w-[280px] shrink-0 flex-col gap-2">
              <header className="flex items-baseline justify-between gap-2 px-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  {stage.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: stage.color }}
                      aria-hidden
                    />
                  )}
                  <span
                    className="truncate font-display text-[14px] font-bold text-text"
                    title={stage.name}
                  >
                    {stage.name}
                  </span>
                </span>
                <span className="font-data shrink-0 text-[12px] font-semibold text-muted">
                  {items.length}
                </span>
              </header>

              {stage.needsDialing && (
                <div className="px-1">
                  <span className="inline-flex items-center rounded-full bg-warning-tint px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
                    Needs dialing
                  </span>
                </div>
              )}

              <div className="flex min-h-[96px] flex-col gap-2 rounded-2xl bg-surface-2 p-2">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12px] text-faint">
                    {stage.needsDialing
                      ? "No leads waiting on a dial."
                      : "No leads in this stage yet."}
                  </p>
                ) : (
                  items.map((lead) => (
                    <SetterCard
                      key={lead.id}
                      lead={lead}
                      stageNeedsDialing={stage.needsDialing}
                      now={now}
                      selected={lead.id === selectedLeadId}
                      onSelect={onSelectLead}
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
