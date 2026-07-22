import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import Avatar from "./Avatar";
import BoardScrollbar from "./BoardScrollbar";
import WonSheet from "./WonSheet";
import MoveStageSheet from "./MoveStageSheet";
import LeadChatModal from "./LeadChatModal";
import { useLeadUnread } from "../hooks/useLeadUnread";
import { useToast } from "../context/ToastContext";
import { useNow } from "../context/NowContext";
import { useMoveLeadStage } from "../hooks/useApi";
import { formatMoney, formatMoneyExact } from "../lib/formatMoney";
import { timeAgo } from "../lib/timeAgo";
import { haptic } from "../lib/haptics";
import type { ApiLead } from "../lib/api";

interface Stage {
  id: string;
  name: string;
  // Per-stage hex from GHL (e.g. "#F97316"). Optional: demo/older data omits it.
  color?: string;
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
  const { unreadFor, markSeen } = useLeadUnread();
  const [chatFor, setChatFor] = useState<ApiLead | null>(null);
  // The horizontally-scrolling stage strip, panned by the drag-slider below it.
  const scrollRef = useRef<HTMLDivElement>(null);

  const openChat = (lead: ApiLead) => {
    markSeen(lead.contactId);
    setChatFor(lead);
  };

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
    haptic();
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
    haptic();
    move.mutate(
      { leadId: lead.id, status: "lost" },
      { onSuccess: () => showToast("Marked Lost"), onError },
    );
  };

  const markWon = (value: number) => {
    const lead = wonFor;
    setWonFor(null);
    if (!lead) return;
    haptic();
    move.mutate(
      { leadId: lead.id, status: "won", value },
      { onSuccess: () => showToast("Marked Won"), onError },
    );
  };

  return (
    <div className="pt-2">
      <div
        ref={scrollRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2"
      >
        {stages.map((stage) => {
          const items = byStage.get(stage.id) ?? [];
          const sum = items.reduce((acc, l) => acc + (l.value ?? 0), 0);
          return (
            <section
              key={stage.id}
              className="flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 lg:w-[300px] lg:max-w-none"
            >
              <header className="flex items-baseline justify-between gap-2 px-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  {stage.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: stage.color }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate font-display text-[14px] font-bold text-[var(--text)]">
                    {stage.name}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-[var(--text-muted)]">
                  {items.length}
                  {sum > 0 ? ` · ${formatMoney(sum)}` : ""}
                </span>
              </header>

              <div className="fx-stagger flex flex-col gap-2 rounded-2xl bg-[var(--surface-2)] p-2">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12px] text-[var(--text-faint)]">
                    Empty
                  </p>
                ) : (
                  items.map((lead) => (
                    <div
                      key={lead.id}
                      className={
                        "fx-item fx-lift relative overflow-hidden rounded-xl border bg-[var(--surface)] p-3 " +
                        (unreadFor(lead.contactId) > 0
                          ? "border-[var(--brand-primary)]/50 before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full before:bg-[var(--brand-primary)] before:content-['']"
                          : "border-[var(--border)]")
                      }
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
                              ? `${formatMoneyExact(lead.value)} · `
                              : ""}
                            {timeAgo(lead.lastActivityAt, now)}
                          </div>
                        </div>
                      </button>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMoving(lead)}
                          className="flex-1 rounded-lg bg-[var(--surface-2)] py-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.98]"
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          onClick={() => openChat(lead)}
                          aria-label={`Chat with ${lead.name}`}
                          className="relative grid w-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--brand-primary)] transition-colors active:scale-[0.98]"
                        >
                          <MessageSquare size={15} aria-hidden />
                          {unreadFor(lead.contactId) > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--brand-primary)] px-1 text-[9.5px] font-bold text-white">
                              {unreadFor(lead.contactId)}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <BoardScrollbar scrollRef={scrollRef} />

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

      {chatFor && (
        <LeadChatModal
          leadId={chatFor.id}
          leadName={chatFor.name}
          hasPhone={chatFor.phone.replace(/[^0-9]/g, "").length >= 10}
          onClose={() => setChatFor(null)}
        />
      )}
    </div>
  );
}
