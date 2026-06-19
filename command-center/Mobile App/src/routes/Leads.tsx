import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Columns3, List as ListIcon, Plus, Search } from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import SplitHero, { HeroMark, HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import BottomNav from "../components/BottomNav";
import Board from "../components/Board";
import PipelineSwitcher from "../components/PipelineSwitcher";
import SearchBar from "../components/SearchBar";
import NewLeadSheet from "../components/NewLeadSheet";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import { useAuth } from "../context/AuthContext";
import { usePipelines } from "../context/PipelinesContext";
import { useNow } from "../context/NowContext";
import { usePipelineLeadsQuery, useSummaryQuery } from "../hooks/useApi";
import { APP_BRAND } from "../lib/appBrand";
import { formatMoney } from "../lib/formatMoney";
import { timeAgo } from "../lib/timeAgo";
import type { ApiLead } from "../lib/api";

const ALL = "__all__";

export default function Leads() {
  const navigate = useNavigate();
  const { session, mode } = useAuth();
  const { pipelines, selectedId, selected, setSelectedId } = usePipelines();
  const now = useNow();
  const useReal = Boolean(session);

  const leadsQuery = usePipelineLeadsQuery(selectedId, useReal);
  const summaryQuery = useSummaryQuery(useReal);
  const [activeStage, setActiveStage] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  // Desktop users expect the kanban board by default (the wide layout shows
  // every stage at once); the phone keeps the list, which reads better on a
  // narrow screen.
  const [viewMode, setViewMode] = useState<"list" | "board">(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1024px)").matches
      ? "board"
      : "list",
  );
  const [showNewLead, setShowNewLead] = useState(false);

  // Reset stage filter + search whenever the pipeline changes.
  useEffect(() => {
    setActiveStage(ALL);
    setSearch("");
    setShowSearch(false);
  }, [selectedId]);

  const leads: ApiLead[] = useMemo(
    () => leadsQuery.data?.leads ?? [],
    [leadsQuery.data],
  );

  const stages = selected?.stages ?? [];
  const stageName = (id: string) =>
    stages.find((s) => s.id === id)?.name ?? "";

  const countsByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) {
      m[l.pipelineStageId] = (m[l.pipelineStageId] ?? 0) + 1;
    }
    return m;
  }, [leads]);

  const switcherCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of summaryQuery.data?.pipelines ?? []) m[p.id] = p.open;
    return m;
  }, [summaryQuery.data]);

  // Hero metrics for the selected pipeline: total won value (the big figure)
  // and how many leads are still open (the accent figure).
  const stats = useMemo(() => {
    let open = 0;
    let wonValue = 0;
    for (const l of leads) {
      const s = (l.status ?? "open").toLowerCase();
      if (s === "open") open += 1;
      if (s === "won") wonValue += l.value ?? 0;
    }
    return { open, wonValue };
  }, [leads]);

  const trimmed = search.trim();
  const visible = useMemo(() => {
    let out = leads;
    if (activeStage !== ALL) {
      out = out.filter((l) => l.pipelineStageId === activeStage);
    }
    if (trimmed) {
      const q = trimmed.toLowerCase();
      const qDigits = trimmed.replace(/\D+/g, "");
      out = out.filter((l) => {
        if (l.name.toLowerCase().includes(q)) return true;
        if (l.email.toLowerCase().includes(q)) return true;
        if (qDigits.length > 0 && l.phone.replace(/\D+/g, "").includes(qDigits))
          return true;
        return false;
      });
    }
    return [...out].sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    );
  }, [leads, activeStage, trimmed]);

  const isTest = mode === "test";

  return (
    <Shell>
      <PullToRefresh queryKeys={[["leads"], ["summary"]]} />
      {isTest && <TestBanner />}

      {/* Dark split hero */}
      <NavyHero flushTop={isTest}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <HeroMark initials={APP_BRAND.initials} />
            <PipelineSwitcher
              pipelines={pipelines}
              selectedId={selectedId}
              onSelect={setSelectedId}
              countsById={switcherCounts}
              variant="onDark"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HeroIconButton
              label="Search leads"
              onClick={() => setShowSearch((v) => !v)}
              pressed={showSearch}
            >
              <Search size={18} />
            </HeroIconButton>
            <HeroIconButton
              label="New lead"
              onClick={() => setShowNewLead(true)}
            >
              <Plus size={18} />
            </HeroIconButton>
          </div>
        </div>

        <SplitHero
          primaryLabel="Won value"
          primaryValue={formatMoney(stats.wonValue)}
          accentValue={stats.open}
          accentLabel="Open leads"
        />
      </NavyHero>

      <div className="flex-1 overflow-y-auto pb-28">
        {/* List / Board view toggle */}
        <div className="flex justify-end px-5 pt-4">
          <div className="inline-flex overflow-hidden rounded-full border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background:
                  viewMode === "list" ? "var(--brand-primary)" : "transparent",
                color: viewMode === "list" ? "#fff" : "var(--text-muted)",
              }}
            >
              <ListIcon size={14} /> List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              aria-pressed={viewMode === "board"}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background:
                  viewMode === "board" ? "var(--brand-primary)" : "transparent",
                color: viewMode === "board" ? "#fff" : "var(--text-muted)",
              }}
            >
              <Columns3 size={14} /> Board
            </button>
          </div>
        </div>

        {viewMode === "board" ? (
          leadsQuery.isError ? (
            <div className="mx-5 mt-4 flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              <span>
                Failed to load the board.{" "}
                {(leadsQuery.error as Error | null)?.message ?? ""}
              </span>
              <button
                type="button"
                onClick={() => void leadsQuery.refetch()}
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold transition-colors active:scale-[0.97] dark:border-rose-800"
              >
                Retry
              </button>
            </div>
          ) : leadsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
                aria-hidden="true"
              />
            </div>
          ) : stages.length === 0 ? (
            <EmptyState message="No stages in this pipeline." />
          ) : (
            <Board leads={leads} stages={stages} pipelineId={selectedId} />
          )
        ) : (
          <>
        {/* Search (revealed from the hero search button) */}
        {(showSearch || trimmed) && (
          <div className="px-5 pt-4">
            <SearchBar value={search} onChange={setSearch} />
          </div>
        )}

        {/* Stage filter */}
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
          <StagePill
            label="All"
            count={leads.length}
            active={activeStage === ALL}
            onClick={() => setActiveStage(ALL)}
          />
          {stages.map((s) => (
            <StagePill
              key={s.id}
              label={s.name}
              count={countsByStage[s.id] ?? 0}
              active={activeStage === s.id}
              onClick={() => setActiveStage(s.id)}
            />
          ))}
        </div>

        {/* List head */}
        <div className="flex items-baseline justify-between px-5 pb-1 pt-5">
          <div className="font-display text-sm font-bold text-[var(--text)]">
            Leads
          </div>
          <div className="text-[13px] font-semibold text-[var(--text-muted)]">
            {visible.length} shown
          </div>
        </div>

        <main className="px-5 pt-2">
          {leadsQuery.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              Failed to load leads.{" "}
              {(leadsQuery.error as Error | null)?.message ?? "Try again."}
            </div>
          ) : leadsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
                aria-hidden="true"
              />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              message={
                trimmed
                  ? `No leads match "${trimmed}"`
                  : activeStage === ALL
                    ? "No leads in this pipeline yet."
                    : "No leads in this stage."
              }
            />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {visible.map((lead, idx) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/lead/${lead.id}`)}
                    className={
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
                      (idx === visible.length - 1
                        ? ""
                        : " border-b border-[var(--divider)]")
                    }
                    style={{ minHeight: "66px" }}
                  >
                    <Avatar name={lead.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                        {lead.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                        {stageName(lead.pipelineStageId) || lead.status}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display text-[15px] font-extrabold tracking-tight text-[var(--text)]">
                        {lead.value && lead.value > 0
                          ? formatMoney(lead.value)
                          : ""}
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-[var(--text-faint)]">
                        {timeAgo(lead.lastActivityAt, now)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
          </>
        )}
      </div>

      <NewLeadSheet
        open={showNewLead}
        pipeline={selected}
        onClose={() => setShowNewLead(false)}
        leadsKey={["leads", "pipeline", selectedId]}
      />

      <BottomNav active="leads" />
    </Shell>
  );
}

function StagePill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors " +
        (active
          ? "text-white"
          : "bg-[var(--surface-2)] text-[var(--text-muted)]")
      }
      style={active ? { backgroundColor: "var(--brand-primary)" } : undefined}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span className={active ? "opacity-80" : "opacity-60"}>{count}</span>
    </button>
  );
}
