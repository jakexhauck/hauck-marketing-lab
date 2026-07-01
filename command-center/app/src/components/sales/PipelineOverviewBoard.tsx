import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useNow } from "../../context/NowContext";
import { timeAgo } from "../../lib/timeAgo";
import type { ApiLead } from "../../lib/api";

interface Stage {
  id: string;
  name: string;
}

interface Props {
  leads: ApiLead[];
  stages: Stage[];
}

// A per-stage accent colour, cycled by column index. Gives each column a stable
// identity (header dot + card avatar) so the eye tracks a stage down the board.
const STAGE_COLORS = [
  "#4f46e5", // indigo (brand)
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#10b981", // emerald
  "#7c73f0", // violet
  "#f43f5e", // rose
  "#14b8a6", // teal
  "#e11d48", // crimson
];

function stageColor(index: number): string {
  return STAGE_COLORS[index % STAGE_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// The read-only "Classic Columns" pipeline board for the Sales Overview. Groups
// open leads by stage into calm grey columns, each headed by a stage-colour dot
// and a live count pill. Cards show who and how long they have waited; clicking
// one opens the lead. No drag, no money, no Move — the interactive board lives on
// the Leads page. Same real pipeline data and stage model as everywhere else.
export default function PipelineOverviewBoard({ leads, stages }: Props) {
  const navigate = useNavigate();
  const now = useNow();

  // Only open leads sit on the board; won/lost have left the pipeline.
  const byStage = useMemo(() => {
    const m = new Map<string, ApiLead[]>();
    for (const s of stages) m.set(s.id, []);
    for (const l of leads) {
      if ((l.status ?? "open").toLowerCase() !== "open") continue;
      m.get(l.pipelineStageId)?.push(l);
    }
    // Longest-waiting first inside each column, so stale leads surface.
    for (const list of m.values()) {
      list.sort(
        (a, b) =>
          new Date(a.lastActivityAt).getTime() -
          new Date(b.lastActivityAt).getTime(),
      );
    }
    return m;
  }, [leads, stages]);

  return (
    <div className="mt-4 min-h-0 flex-1 overflow-auto pb-2">
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${stages.length}, minmax(260px, 1fr))`,
        }}
      >
        {stages.map((stage, i) => {
          const items = byStage.get(stage.id) ?? [];
          const color = stageColor(i);
          return (
            <section
              key={stage.id}
              className="flex flex-col rounded-2xl bg-surface-2 p-1.5 pb-3"
            >
              <header className="flex items-center gap-2 px-2.5 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="truncate font-display text-[13.5px] font-semibold text-text">
                  {stage.name}
                </span>
                <span className="ml-auto shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 font-display text-[11px] font-semibold text-muted">
                  {items.length}
                </span>
              </header>

              <div className="fx-stagger flex flex-col gap-2 px-1.5">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12px] text-faint">
                    Empty
                  </p>
                ) : (
                  items.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => navigate(`/lead/${lead.id}`)}
                      className="fx-item fx-lift flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-brand/40"
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-[11px] font-semibold text-white"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      >
                        {initials(lead.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[14px] font-bold text-text">
                          {lead.name}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] font-medium text-faint">
                          {timeAgo(lead.lastActivityAt, now)}
                        </div>
                      </div>
                    </button>
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
