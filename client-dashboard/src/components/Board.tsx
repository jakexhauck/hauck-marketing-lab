import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import Avatar from "./Avatar";
import WonSheet from "./WonSheet";
import Toast from "./Toast";
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
  const [moving, setMoving] = useState<ApiLead | null>(null);
  const [wonFor, setWonFor] = useState<ApiLead | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const onError = () => setToast("Could not move lead. Reverted.");

  const moveToStage = (lead: ApiLead, stageId: string) => {
    setMoving(null);
    if (lead.pipelineStageId === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    move.mutate(
      { leadId: lead.id, pipelineStageId: stageId },
      {
        onSuccess: () => setToast(`Moved to ${stage?.name ?? "stage"}`),
        onError,
      },
    );
  };

  const markLost = (lead: ApiLead) => {
    setMoving(null);
    move.mutate(
      { leadId: lead.id, status: "lost" },
      { onSuccess: () => setToast("Marked Lost"), onError },
    );
  };

  const markWon = (value: number) => {
    const lead = wonFor;
    setWonFor(null);
    if (!lead) return;
    move.mutate(
      { leadId: lead.id, status: "won", value },
      { onSuccess: () => setToast("Marked Won"), onError },
    );
  };

  return (
    <div className="pt-2">
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
        {stages.map((stage) => {
          const items = byStage.get(stage.id) ?? [];
          const sum = items.reduce((acc, l) => acc + (l.value ?? 0), 0);
          return (
            <section
              key={stage.id}
              className="flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2"
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
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                    >
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
                            {timeAgo(lead.lastActivityAt)}
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
        <MoveSheet
          lead={moving}
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

interface MoveSheetProps {
  lead: ApiLead;
  stages: Stage[];
  onClose: () => void;
  onPickStage: (stageId: string) => void;
  onWon: () => void;
  onLost: () => void;
}

function MoveSheet({
  lead,
  stages,
  onClose,
  onPickStage,
  onWon,
  onLost,
}: MoveSheetProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[var(--surface)] p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="min-w-0 truncate font-display text-lg font-bold text-[var(--text)]">
            Move {lead.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] active:scale-[0.96]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <span className="label-cap px-1 pb-1">Stage</span>
          {stages.map((s) => {
            const current = s.id === lead.pipelineStageId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={current}
                onClick={() => onPickStage(s.id)}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold text-[var(--text)] transition-colors active:bg-[var(--surface-2)] disabled:opacity-50"
              >
                <span>{s.name}</span>
                {current && (
                  <Check
                    size={16}
                    aria-hidden="true"
                    className="text-[var(--brand-primary)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2 border-t border-[var(--divider)] pt-3">
          <button
            type="button"
            onClick={onWon}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-[13px] font-bold uppercase tracking-wider text-white active:scale-[0.98]"
          >
            Mark Won
          </button>
          <button
            type="button"
            onClick={onLost}
            className="flex-1 rounded-xl border border-[var(--border)] py-3 text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)] active:scale-[0.98] active:bg-[var(--surface-2)]"
          >
            Mark Lost
          </button>
        </div>
      </div>
    </div>
  );
}
