import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import WonSheet from "./WonSheet";
import MoveStageSheet from "./MoveStageSheet";
import { useToast } from "../context/ToastContext";
import { useNow } from "../context/NowContext";
import { useMoveLeadStage } from "../hooks/useApi";
import { formatMoney } from "../lib/formatMoney";
import { timeAgo } from "../lib/timeAgo";
import type { ApiLead } from "../lib/api";

interface Stage {
  id: string;
  name: string;
}

interface Props {
  leads: ApiLead[];
  stages: Stage[];
  pipelineId: string | null;
}

export default function Board({ leads, stages, pipelineId }: Props) {
  const navigate = useNavigate();
  const move = useMoveLeadStage(pipelineId);
  const { showToast } = useToast();
  const now = useNow();
  const [moving, setMoving] = useState<ApiLead | null>(null);
  const [wonFor, setWonFor] = useState<ApiLead | null>(null);

  // The card mid-move shows a pending overlay until the mutation settles, so
  // an optimistic hop the server later rejects never looks final.
  const pendingLeadId = move.isPending ? move.variables?.leadId : null;

  // Group open leads by stage. Won/Lost leads leave the open board.
  const byStage = useMemo(() => {
    const m = new Map<string, ApiLead[]>();
    for (const s of stages) m.set(s.id, []);
    for (const l of leads) {
      if ((l.status ?? "open").toLowerCase() !== "open") continue;
      const list = m.get(l.pipelineStageId);
      if (list) list.push(l);
    }
    return m;
  }, [leads, stages]);

  const onError = () => showToast("Could not move lead. Reverted.");

  const moveToStage = (lead: ApiLead, stageId: string) => {
    setMoving(null);
    if (lead.pipelineStageId === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    move.mutate(
      { leadId: lead.id, pipelineStageId: stageId },
      {
        onSuccess: () => showToast(`Moved to ${stage?.name ?? "stage"}`),
        onError,
      },
    );
  };

  const markLost = (lead: ApiLead) => {
    setMoving(null);
    move.mutate(
      { leadId: lead.id, status: "lost" },
      { onSuccess: () => showToast("Marked Lost"), onError },
    );
  };

  const markWon = (value: number) => {
    const lead = wonFor;
    setWonFor(null);
    if (!lead) return;
    move.mutate(
      { leadId: lead.id, status: "won", value },
      { onSuccess: () => showToast("Marked Won"), onError },
    );
  };

  return (
    <div className="pt-2">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
        {stages.map((stage) => {
          const items = byStage.get(stage.id) ?? [];
          const sum = items.reduce((acc, l) => acc + (l.value ?? 0), 0);
          return (
            <section
              key={stage.id}
              className="flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 lg:w-[300px] lg:max-w-none"
            >
              <header className="flex items-baseline justify-between px-1">
                <span className="truncate font-display text-[14px] font-bold text-[var(--text)]">
                  {stage.name}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-[var(--text-muted)]">
                  {items.length}
                  {sum > 0 ? ` · ${formatMoney(sum)}` : ""}
                </span>
              </header>

              <div className="flex flex-col gap-2 rounded-2xl bg-[var(--surface-2)] p-2">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12px] text-[var(--text-faint)]">
                    Empty
                  </p>
                ) : (
                  items.map((lead) => (
                    <div
                      key={lead.id}
                      className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                    >
                      {pendingLeadId === lead.id && (
                        <div
                          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--surface)]/70"
                          aria-label="Saving move"
                        >
                          <div
                            className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/lead/${lead.id}`)}
                        className="flex w-full items-center gap-2.5 text-left"
                      >
                        <Avatar name={lead.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-[14px] font-bold text-[var(--text)]">
                            {lead.name}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">
                            {lead.value && lead.value > 0
                              ? `${formatMoney(lead.value)} · `
                              : ""}
                            {timeAgo(lead.lastActivityAt, now)}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoving(lead)}
                        className="mt-2 w-full rounded-lg bg-[var(--surface-2)] py-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.98]"
                      >
                        Move
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {moving && (
        <MoveStageSheet
          leadName={moving.name}
          currentStageId={moving.pipelineStageId}
          stages={stages}
          onClose={() => setMoving(null)}
          onPickStage={(stageId) => moveToStage(moving, stageId)}
          onWon={() => {
            setMoving(null);
            setWonFor(moving);
          }}
          onLost={() => markLost(moving)}
        />
      )}

      <WonSheet
        open={!!wonFor}
        onCancel={() => setWonFor(null)}
        onSave={markWon}
      />
    </div>
  );
}
