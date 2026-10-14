import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ArrowLeft,
  Phone,
  Check,
  Trophy,
  XCircle,
  RotateCcw,
  ClipboardList,
} from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import Avatar from "../../components/Avatar";
import { Panel, EmptyState } from "../../components/ui";
import { cn } from "../../lib/cn";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { demoMode } from "../../demo/demoMode";
import { useToast } from "../../context/ToastContext";
import { usePipelines } from "../../context/PipelinesContext";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import { useMoveSalesLeadStage } from "../../hooks/useApi";
import { formatMoney } from "../../lib/formatMoney";
import { SOURCE_META, STATUS_META, type HubLead, type LeadStatus } from "../../lib/leadsHub";
import type { ApiPipelineSummary } from "../../lib/api";
import { NotConnectedNotice } from "./shared";

// The Job Console: one screen where the client works an active lead to a close.
// Left = a queue of open Paid + Organic leads; right = a focused console for the
// selected lead (move it through its pipeline, type the job amount, mark the
// outcome). Every action is ONE live write through /api/sales/leads/:id/stage
// (stage + amount + status in a single call). Demo/preview is fully walkable; a
// real, unconnected session shows an honest empty state.

// A GHL opportunity status that means the lead is done (drops from the queue).
const CLOSED = new Set(["won", "lost", "abandoned"]);

// Whether a lead is closed and should leave the active queue. Live leads carry a
// raw `outcome` (open/won/lost/abandoned). Demo rows have none, so we fall back
// to the friendly `status`: a "won" demo lead is closed (a real won lead is
// excluded by its outcome; parked/cold leads stay open, matching real data where
// a cold-stage opportunity is still GHL-status "open").
function isLeadClosed(lead: HubLead): boolean {
  if (lead.outcome) return CLOSED.has(lead.outcome.toLowerCase());
  return lead.status === "won";
}

// Where on the stage rail a lead sits when we have no real stage id (demo rows
// carry a friendly status but no pipeline stage). Fraction of the way through
// the pipeline, resolved to the nearest stage.
const STATUS_FRACTION: Record<LeadStatus, number> = {
  new: 0,
  working: 0.4,
  booked: 0.7,
  won: 1,
  cold: 0.5,
};

// The optimistic overlay applied to a lead after a successful write. The merged
// feed reference is stable in demo (no refetch), and even a real refetch lags a
// beat, so the console holds its own applied changes for instant reflection.
interface Override {
  pipelineStageId?: string;
  stageName?: string;
  value?: number | null;
  outcome?: string;
}

function firstName(lead: HubLead): string {
  return lead.name.split(" ")[0] || lead.name;
}

// "$1,250" or "" from a free-typed amount field. Empty / zero / junk -> undefined
// so a Won with no price still writes cleanly (no monetaryValue key).
function parseAmount(raw: string): number | undefined {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default function JobConsole() {
  const demo = demoMode();
  const { leads } = useLeadsHub();
  const { pipelines } = usePipelines();
  const move = useMoveSalesLeadStage();
  const { showToast } = useToast();

  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");

  function applyOverride(id: string, patch: Override) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  // Merge the applied overrides over the live feed for display.
  const merged: HubLead[] = useMemo(
    () => leads.map((l) => ({ ...l, ...overrides[l.id] })),
    [leads, overrides],
  );

  // The queue: still-open leads, newest first (feed order), name/phone search.
  const queue = useMemo(() => {
    const open = merged.filter((l) => !isLeadClosed(l));
    const q = search.trim().toLowerCase();
    if (!q) return open;
    const qDigits = q.replace(/\D+/g, "");
    return open.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (qDigits.length > 0 && l.phone.replace(/\D+/g, "").includes(qDigits)),
    );
  }, [merged, search]);

  const selected = useMemo(
    () => merged.find((l) => l.id === selectedId) ?? null,
    [merged, selectedId],
  );

  // Reset the amount field to the selected lead's current value on every select.
  useEffect(() => {
    if (selected) setAmount(selected.value ? String(selected.value) : "");
  }, [selectedId, selected]);

  // The lead's pipeline: by real id, falling back to the single demo pipeline so
  // the stage rail always renders in preview.
  function pipelineFor(lead: HubLead): ApiPipelineSummary | null {
    return (
      pipelines.find((p) => p.id === lead.pipelineId) ??
      (demo ? pipelines[0] ?? null : null)
    );
  }

  // The index of the lead's current stage within its pipeline.
  function currentStageIdx(lead: HubLead, pipe: ApiPipelineSummary): number {
    const byId = lead.pipelineStageId
      ? pipe.stages.findIndex((s) => s.id === lead.pipelineStageId)
      : -1;
    if (byId >= 0) return byId;
    if (lead.stageName) {
      const nm = lead.stageName.toLowerCase();
      const byName = pipe.stages.findIndex((s) => s.name.toLowerCase() === nm);
      if (byName >= 0) return byName;
    }
    const frac = STATUS_FRACTION[lead.status] ?? 0.4;
    return Math.round(frac * (pipe.stages.length - 1));
  }

  // ---- writes (one mutation, one live opportunity update) ------------------

  function moveToStage(lead: HubLead, stage: { id: string; name: string }) {
    if (move.isPending) return;
    move.mutate(
      { leadId: lead.id, stageName: stage.name },
      {
        onSuccess: () => {
          applyOverride(lead.id, { pipelineStageId: stage.id, stageName: stage.name });
          showToast(`Moved ${firstName(lead)} to ${stage.name}.`);
        },
        onError: () => showToast("Could not move the lead. Please try again."),
      },
    );
  }

  function markWon(lead: HubLead) {
    if (move.isPending) return;
    const price = parseAmount(amount);
    move.mutate(
      { leadId: lead.id, status: "won", monetaryValue: price },
      {
        onSuccess: () => {
          applyOverride(lead.id, { outcome: "won", value: price ?? lead.value });
          showToast(
            price
              ? `Marked ${firstName(lead)} won, ${formatMoney(price)}.`
              : `Marked ${firstName(lead)} won.`,
          );
          setSelectedId(null);
        },
        onError: () => showToast("Could not save the outcome. Please try again."),
      },
    );
  }

  function markLost(lead: HubLead) {
    if (move.isPending) return;
    move.mutate(
      { leadId: lead.id, status: "lost" },
      {
        onSuccess: () => {
          applyOverride(lead.id, { outcome: "lost" });
          showToast(`Marked ${firstName(lead)} lost.`);
          setSelectedId(null);
        },
        onError: () => showToast("Could not save the outcome. Please try again."),
      },
    );
  }

  const hasLeads = merged.length > 0;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageTabs tabs={LEADS_TABS} />
        <header className="mb-4">
          <h1 className="font-display text-[19px] font-semibold text-text">Console</h1>
          <p className="mt-1 text-[13px] text-muted">
            Work a lead to a close: move it through the pipeline, log the job amount,
            and mark the outcome.
          </p>
        </header>

        {!demo && !hasLeads && (
          <div className="mb-4">
            <NotConnectedNotice message="Your active leads land here to be worked once your ad accounts, website forms and phone are connected." />
          </div>
        )}

        <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* LEFT — queue */}
          <div
            className={cn(
              "min-h-0 flex-col border-divider lg:flex lg:w-[360px] lg:border-r",
              selectedId ? "hidden" : "flex",
            )}
          >
            <div className="border-b border-divider p-3">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads"
                  className="w-full rounded-[10px] border border-border bg-[var(--bg)] py-2 pl-9 pr-3 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>
              <div className="mt-2 px-1 text-[11.5px] font-semibold text-faint">
                {queue.length} active
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {queue.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList size={22} />}
                  title="No active leads"
                  description={
                    search.trim()
                      ? "No leads match your search."
                      : "Leads to work will appear here as they come in."
                  }
                />
              ) : (
                <ul>
                  {queue.map((lead) => (
                    <QueueRow
                      key={lead.id}
                      lead={lead}
                      active={lead.id === selectedId}
                      onSelect={() => setSelectedId(lead.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT — console */}
          <div
            className={cn(
              "min-h-0 flex-1 flex-col bg-surface-2/40 lg:flex",
              selectedId ? "flex" : "hidden",
            )}
          >
            {selected ? (
              <ConsolePanel
                lead={selected}
                pipeline={pipelineFor(selected)}
                currentIdx={
                  (() => {
                    const p = pipelineFor(selected);
                    return p ? currentStageIdx(selected, p) : -1;
                  })()
                }
                amount={amount}
                onAmount={setAmount}
                pending={move.isPending}
                onBack={() => setSelectedId(null)}
                onMove={(stage) => moveToStage(selected, stage)}
                onWon={() => markWon(selected)}
                onLost={() => markLost(selected)}
              />
            ) : (
              <div className="grid flex-1 place-items-center">
                <EmptyState
                  icon={<ClipboardList size={22} />}
                  title="Pick a lead to work it"
                  description="Choose a lead from the queue to move it through the pipeline and log the outcome."
                />
              </div>
            )}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

// --- Queue row --------------------------------------------------------------

function QueueRow({
  lead,
  active,
  onSelect,
}: {
  lead: HubLead;
  active: boolean;
  onSelect: () => void;
}) {
  const src = SOURCE_META[lead.source];
  const stage = lead.stageName || STATUS_META[lead.status].label;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left transition-colors",
          active ? "bg-brand-tint" : "hover:bg-surface-2",
        )}
        aria-pressed={active}
      >
        <Avatar name={lead.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[14px] font-semibold text-text">
              {lead.name}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
              style={{
                color: src.accent,
                background: `color-mix(in srgb, ${src.accent} 12%, transparent)`,
              }}
            >
              {src.short}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-muted">{stage}</div>
        </div>
        <div className="shrink-0 text-right">
          {lead.value ? (
            <div className="font-display text-[13.5px] font-semibold text-text">
              {formatMoney(lead.value)}
            </div>
          ) : null}
          <div className="text-[10.5px] text-faint">{lead.when}</div>
        </div>
      </button>
    </li>
  );
}

// --- Console panel ----------------------------------------------------------

function ConsolePanel({
  lead,
  pipeline,
  currentIdx,
  amount,
  onAmount,
  pending,
  onBack,
  onMove,
  onWon,
  onLost,
}: {
  lead: HubLead;
  pipeline: ApiPipelineSummary | null;
  currentIdx: number;
  amount: string;
  onAmount: (v: string) => void;
  pending: boolean;
  onBack: () => void;
  onMove: (stage: { id: string; name: string }) => void;
  onWon: () => void;
  onLost: () => void;
}) {
  const src = SOURCE_META[lead.source];
  const telDigits = lead.phone.replace(/[^0-9+]/g, "");
  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
  const stages = pipeline?.stages ?? [];
  const currentStageName =
    currentIdx >= 0 ? stages[currentIdx]?.name : lead.stageName;
  // The pipeline's follow-up stage, if it has one (otherwise no dead button).
  const followUp = stages.find((s) => /follow[\s-]?up/i.test(s.name));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-divider bg-surface px-4 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-text lg:hidden"
          aria-label="Back to the queue"
        >
          <ArrowLeft size={16} />
        </button>
        <Avatar name={lead.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[16px] font-semibold text-text">
              {lead.name}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
              style={{
                color: src.accent,
                background: `color-mix(in srgb, ${src.accent} 12%, transparent)`,
              }}
            >
              {src.label}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted">
            {currentStageName ? `${currentStageName}` : "New lead"}
            {pipeline ? ` · ${pipeline.name}` : ""}
          </div>
        </div>
        {hasPhone && (
          <a
            href={`tel:${telDigits}`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-text transition-colors hover:opacity-90"
            aria-label={`Call ${lead.name}`}
          >
            <Phone size={16} />
          </a>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* stage rail */}
        <SectionLabel>Move stage</SectionLabel>
        {stages.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            This lead's pipeline stages are not available.
          </p>
        ) : (
          <ol className="mt-2 space-y-1">
            {stages.map((stage, i) => {
              const isCurrent = i === currentIdx;
              const isPast = currentIdx >= 0 && i < currentIdx;
              return (
                <li key={stage.id}>
                  <button
                    type="button"
                    disabled={isCurrent || pending}
                    onClick={() => onMove(stage)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
                      isCurrent
                        ? "border-brand/40 bg-brand-tint"
                        : "border-border bg-surface hover:border-brand/40 disabled:opacity-60",
                    )}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                        isCurrent
                          ? "text-white"
                          : isPast
                            ? "bg-positive-tint text-positive"
                            : "bg-surface-2 text-faint",
                      )}
                      style={isCurrent ? { backgroundImage: "var(--grad-brand)" } : undefined}
                      aria-hidden
                    >
                      {isPast ? <Check size={12} /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "flex-1 truncate font-display text-[13px]",
                        isCurrent ? "font-semibold text-brand-text" : "text-text",
                      )}
                    >
                      {stage.name}
                    </span>
                    {isCurrent && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-text">
                        Current
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* amount */}
        <SectionLabel className="mt-5">Job amount</SectionLabel>
        <p className="mt-1 text-[12px] text-muted">What the job was for.</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-display text-[15px] font-semibold text-faint">
              $
            </span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-[10px] border border-border bg-[var(--bg)] py-2.5 pl-7 pr-3 font-display text-[15px] font-semibold text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      </div>

      {/* outcome bar */}
      <div className="flex flex-wrap gap-2 border-t border-divider bg-surface px-4 py-3">
        <button
          type="button"
          disabled={pending}
          onClick={onWon}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-positive/40 bg-positive-tint px-3 py-2.5 font-display text-[13px] font-semibold text-positive transition-colors hover:opacity-90 disabled:opacity-60"
        >
          <Trophy size={15} /> Won
        </button>
        {followUp && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onMove(followUp)}
            className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2.5 font-display text-[13px] font-semibold text-text transition-colors hover:border-brand/40 disabled:opacity-60"
          >
            <RotateCcw size={15} /> Follow up
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onLost}
          className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2.5 font-display text-[13px] font-semibold text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-60"
        >
          <XCircle size={15} /> Lost
        </button>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-display text-[11px] font-bold uppercase tracking-wide text-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}
