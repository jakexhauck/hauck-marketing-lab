import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import PageTabs from "../PageTabs";
import { LEADS_TABS } from "../../lib/pageTabs";
import { PAGE_CONTAINER } from "../../lib/layout";
import { Button } from "../ui/Button";
import Board from "../Board";
import PipelineSwitcher from "../PipelineSwitcher";
import NewLeadSheet from "../NewLeadSheet";
import EmptyState from "../EmptyState";
import { useAuth } from "../../context/AuthContext";
import { usePipelines } from "../../context/PipelinesContext";
import { usePipelineLeadsQuery, useSummaryQuery } from "../../hooks/useApi";
import { formatMoney } from "../../lib/formatMoney";
import type { ApiLead } from "../../lib/api";

// The Atelier desktop Pipeline (lg+): the wide kanban command deck. The phone
// keeps its own (NavyHero + list/board toggle) layout below lg; this renders
// only inside `hidden lg:flex` from the Leads route. Same real data, hooks and
// mutations as the phone screen: it reuses the Board component (and its stage
// moves, Won/Lost sheets, pending overlay and lead navigation) untouched, and
// only restyles the surrounding chrome into the calm command-deck system.
export default function LeadsDesktop() {
  const { session } = useAuth();
  const { pipelines, selectedId, selected, setSelectedId } = usePipelines();
  const useReal = Boolean(session);

  const leadsQuery = usePipelineLeadsQuery(selectedId, useReal);
  const summaryQuery = useSummaryQuery(useReal);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [showNewLead, setShowNewLead] = useState(false);

  // Switching pipelines clears the search (mirroring the phone screen) and drops
  // ?q so the topbar seed cannot re-apply. Tying the clear to this explicit user
  // action (not a selectedId effect) keeps a ?q seed from being wiped while the
  // pipeline list resolves asynchronously on load.
  const selectPipeline = (id: string) => {
    setSearch("");
    if (searchParams.has("q")) {
      const next = new URLSearchParams(searchParams);
      next.delete("q");
      setSearchParams(next, { replace: true });
    }
    setSelectedId(id);
  };

  // Re-seed when the topbar search routes here again with a new ?q.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q != null) setSearch(q);
  }, [searchParams]);

  const leads: ApiLead[] = useMemo(
    () => leadsQuery.data?.leads ?? [],
    [leadsQuery.data],
  );

  const stages = selected?.stages ?? [];

  // Open-lead count badges for the pipeline switcher, from the summary feed.
  const switcherCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of summaryQuery.data?.pipelines ?? []) m[p.id] = p.open;
    return m;
  }, [summaryQuery.data]);

  // Header counts for the selected pipeline: open leads and their total value.
  const headerStats = useMemo(() => {
    let open = 0;
    let openValue = 0;
    for (const l of leads) {
      if ((l.status ?? "open").toLowerCase() === "open") {
        open += 1;
        openValue += l.value ?? 0;
      }
    }
    return { open, openValue };
  }, [leads]);

  // Search narrows the cards on the board; the columns themselves stay so the
  // operator never loses the shape of the pipeline while filtering.
  const trimmed = search.trim();
  const visibleLeads = useMemo(() => {
    if (!trimmed) return leads;
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    return leads.filter((l) => {
      if (l.name.toLowerCase().includes(q)) return true;
      if (l.email.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0 && l.phone.replace(/\D+/g, "").includes(qDigits))
        return true;
      return false;
    });
  }, [leads, trimmed]);

  const subtitle = trimmed
    ? `${visibleLeads.length} of ${leads.length} ${
        leads.length === 1 ? "lead" : "leads"
      }`
    : `${headerStats.open} open · ${formatMoney(headerStats.openValue)} in flight`;

  return (
    <div className={PAGE_CONTAINER}>
      {/* Shared Leads frame: the tab bar sits at the very top on every sub-tab
          (Pipeline, Console, Organic, Paid Ads) so switching between them never
          shifts the header. The per-tab title + actions live just under it. */}
      <PageTabs tabs={LEADS_TABS} />
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[19px] font-semibold text-text">Pipeline</h1>
          <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <PipelineSwitcher
            pipelines={pipelines}
            selectedId={selectedId}
            onSelect={selectPipeline}
            countsById={switcherCounts}
          />
          <Button variant="primary" onClick={() => setShowNewLead(true)}>
            <Plus size={16} />
            New lead
          </Button>
        </div>
      </header>
      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone"
          aria-label="Search leads"
          className="w-full rounded-[var(--radius)] border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </div>

      {leadsQuery.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          <span>
            Failed to load the board.{" "}
            {(leadsQuery.error as Error | null)?.message ?? ""}
          </span>
          <button
            type="button"
            onClick={() => void leadsQuery.refetch()}
            className="rounded-[var(--radius)] border border-danger/40 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-danger/10"
          >
            Retry
          </button>
        </div>
      ) : leadsQuery.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      ) : stages.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
          <EmptyState
            title="No stages"
            message="This pipeline has no stages configured yet."
          />
        </div>
      ) : (
        // Reuse the Board exactly: stage grouping, Move / Won / Lost sheets,
        // optimistic move with pending overlay, and lead navigation all live
        // inside it. We only feed it the (search-filtered) leads.
        <Board
          leads={visibleLeads}
          stages={stages}
          pipelineId={selectedId}
        />
      )}

      <NewLeadSheet
        open={showNewLead}
        pipeline={selected}
        onClose={() => setShowNewLead(false)}
        leadsKey={["leads", "pipeline", selectedId]}
      />
    </div>
  );
}
