import { useMemo } from "react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import PipelineSwitcher from "../../components/PipelineSwitcher";
import PipelineOverviewBoard from "../../components/sales/PipelineOverviewBoard";
import { EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { usePipelines } from "../../context/PipelinesContext";
import { usePipelineLeadsQuery, useSummaryQuery } from "../../hooks/useApi";
import { PAGE_CONTAINER } from "../../lib/layout";
import type { ApiLead } from "../../lib/api";

// Sales Overview: the main sales pipeline as a calm, read-only kanban ("Classic
// Columns"). It reuses the same pipeline context, leads feed and stage model as
// the Leads page, but drops every write path — this is the at-a-glance view of
// where each lead sits, not the place you work them. Switching pipelines (when a
// client has more than one) and opening a lead are the only interactions.
export default function SalesOverview() {
  const { session } = useAuth();
  const { pipelines, selectedId, selected, setSelectedId } = usePipelines();
  const useReal = Boolean(session);

  const leadsQuery = usePipelineLeadsQuery(selectedId, useReal);
  const summaryQuery = useSummaryQuery(useReal);

  const leads: ApiLead[] = useMemo(
    () => leadsQuery.data?.leads ?? [],
    [leadsQuery.data],
  );

  const stages = selected?.stages ?? [];

  // Open-lead badges for the pipeline switcher, from the summary feed.
  const switcherCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of summaryQuery.data?.pipelines ?? []) m[p.id] = p.open;
    return m;
  }, [summaryQuery.data]);

  const openCount = useMemo(
    () =>
      leads.filter((l) => (l.status ?? "open").toLowerCase() === "open").length,
    [leads],
  );

  const description = selected
    ? `${selected.name} · ${openCount} open`
    : "Your main sales pipeline, end to end.";

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageHeader
          title="Sales Pipeline"
          description={description}
          actions={
            pipelines.length > 1 ? (
              <PipelineSwitcher
                pipelines={pipelines}
                selectedId={selectedId}
                onSelect={setSelectedId}
                countsById={switcherCounts}
              />
            ) : undefined
          }
        />

        {leadsQuery.isError ? (
          <div className="mt-4 flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            <span>
              Failed to load the pipeline.{" "}
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
          <div className="mt-4 rounded-[var(--radius-lg)] border border-border bg-surface py-6">
            <EmptyState
              title="No pipeline yet"
              description="Your sales pipeline appears here once it is connected."
            />
          </div>
        ) : (
          <PipelineOverviewBoard leads={leads} stages={stages} />
        )}
      </div>
    </Shell>
  );
}
