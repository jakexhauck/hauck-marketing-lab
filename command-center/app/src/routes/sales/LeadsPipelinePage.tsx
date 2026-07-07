import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import Board from "../../components/Board";
import NewLeadSheet from "../../components/NewLeadSheet";
import EmptyState from "../../components/EmptyState";
import { Button } from "../../components/ui/Button";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { formatMoney } from "../../lib/formatMoney";
import { useAuth } from "../../context/AuthContext";
import { useLeadPipeline } from "../../hooks/useLeadPipeline";
import { usePipelineLeadsQuery } from "../../hooks/useApi";
import type { ApiLead } from "../../lib/api";
import type { LeadPipelineKind } from "../../lib/leadPipelines";

const COPY: Record<LeadPipelineKind, string> = {
  sales:
    "Every lead in your sales pipeline. Drag a card to move a stage, or tap a card to open the conversation.",
  trash:
    "Leads that went cold, opted out, or were not a fit. Kept for the record and for reactivation.",
};

// One responsive board for the Sales or Trash pipeline: the section PageBar
// (tabs, search, "New lead") over the shared kanban Board. Replaces the old
// phone Leads.tsx hero/list and the separate LeadsDesktop component, which
// duplicated this same board behind a viewport split.
export default function LeadsPipelinePage({ kind }: { kind: LeadPipelineKind }) {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const { pipeline, isLoading: pipeLoading } = useLeadPipeline(kind);
  const pipelineId = pipeline?.id ?? null;
  const leadsQuery = usePipelineLeadsQuery(pipelineId, useReal);
  const [search, setSearch] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);

  const stages = pipeline?.stages ?? [];
  const leads: ApiLead[] = useMemo(
    () => leadsQuery.data?.leads ?? [],
    [leadsQuery.data],
  );

  const trimmed = search.trim();
  const visible = useMemo(() => {
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

  const openCount = useMemo(
    () => leads.filter((l) => (l.status ?? "open").toLowerCase() === "open").length,
    [leads],
  );
  const openValue = useMemo(
    () =>
      leads.reduce(
        (sum, l) =>
          (l.status ?? "open").toLowerCase() === "open" ? sum + (l.value ?? 0) : sum,
        0,
      ),
    [leads],
  );

  const loading = (useReal && pipeLoading) || leadsQuery.isLoading;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar
          tabs={LEADS_TABS}
          count={kind === "sales" ? `${openCount} open · ${formatMoney(openValue)}` : undefined}
          description={COPY[kind]}
          actions={
            <Button variant="primary" size="sm" onClick={() => setShowNewLead(true)}>
              <Plus size={15} />
              New lead
            </Button>
          }
          filters={
            <label className="relative flex-1 max-w-xs">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or phone"
                aria-label="Search leads"
                className="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
              />
            </label>
          }
        />

        {leadsQuery.isError ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            Could not load this pipeline. {(leadsQuery.error as Error | null)?.message ?? ""}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : !pipeline ? (
          <EmptyState message="This pipeline is not set up yet." />
        ) : stages.length === 0 ? (
          <EmptyState message="This pipeline has no stages yet." />
        ) : (
          <Board leads={visible} stages={stages} pipelineId={pipelineId} />
        )}

        <NewLeadSheet
          open={showNewLead}
          pipeline={pipeline}
          onClose={() => setShowNewLead(false)}
          leadsKey={["leads", "pipeline", pipelineId]}
        />
      </div>
    </Shell>
  );
}
