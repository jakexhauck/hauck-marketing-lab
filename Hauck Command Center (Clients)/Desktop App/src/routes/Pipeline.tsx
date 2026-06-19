import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { usePipelinesQuery, useLeadsQuery, useMoveLeadStage, useSummaryQuery } from "@/hooks/useApi";
import { useToast } from "@/context/ToastContext";
import { Segmented, EmptyState, ErrorState } from "@/components/ui";
import { Board, BoardSkeleton } from "@/components/pipeline/Board";
import { LeadTable, LeadTableSkeleton } from "@/components/pipeline/LeadTable";
import { LeadDrawer } from "@/components/pipeline/LeadDrawer";

type View = "board" | "list";

export function Pipeline() {
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();

  const pipelinesQ = usePipelinesQuery();
  const pipelines = pipelinesQ.data?.pipelines ?? [];
  const summaryQ = useSummaryQuery();

  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");

  // Default to the most-populated pipeline (from the summary totals) once things
  // load, so you open onto where the work actually is. Falls back to the first.
  useEffect(() => {
    if (pipelineId || pipelines.length === 0) return;
    // Wait for the summary totals so we open onto the busiest pipeline, not the
    // first one to load. If the summary errors out, fall back to the first.
    if (summaryQ.isLoading) return;
    const totals = new Map(summaryQ.data?.pipelines.map((p) => [p.id, p.total]) ?? []);
    const busiest = [...pipelines].sort(
      (a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0),
    )[0];
    setPipelineId(busiest.id);
  }, [pipelineId, pipelines, summaryQ.data]);

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId) ?? pipelines[0],
    [pipelines, pipelineId],
  );

  const leadsQ = useLeadsQuery(activePipeline?.id);
  const leads = leadsQ.data?.leads ?? [];
  const move = useMoveLeadStage(activePipeline?.id ?? "");

  // The drawer is driven by the ?lead= param so the command palette can deep-link
  // and the URL stays shareable.
  const openLeadId = params.get("lead");

  function openLead(id: string) {
    const next = new URLSearchParams(params);
    next.set("lead", id);
    setParams(next, { replace: false });
  }

  function closeLead() {
    const next = new URLSearchParams(params);
    next.delete("lead");
    setParams(next, { replace: true });
  }

  function handleMove(leadId: string, pipelineStageId: string) {
    if (!activePipeline) return;
    move.mutate(
      { leadId, pipelineStageId },
      { onError: () => toast("Couldn't move the lead. Reverted.", "error") },
    );
  }

  // --- Top-level loading / error before any pipeline resolves ---------------
  if (pipelinesQ.isLoading) {
    return (
      <div>
        <PageHeader title="Pipeline" description="Your leads by stage." />
        <BoardSkeleton />
      </div>
    );
  }

  if (pipelinesQ.isError) {
    return (
      <div>
        <PageHeader title="Pipeline" />
        <ErrorState
          title="Couldn't load pipelines"
          description="Check your connection and try again."
          onRetry={() => void pipelinesQ.refetch()}
        />
      </div>
    );
  }

  if (pipelines.length === 0 || !activePipeline) {
    return (
      <div>
        <PageHeader title="Pipeline" />
        <EmptyState
          icon={<Users size={22} />}
          title="No pipelines yet"
          description="Pipelines from your Command Center will appear here once configured."
        />
      </div>
    );
  }

  const drawer = openLeadId ? (
    <LeadDrawer leadId={openLeadId} pipeline={activePipeline} onClose={closeLead} />
  ) : null;

  return (
    <div>
      <PageHeader
        title="Pipeline"
        count={leadsQ.data ? leadsQ.data.total : undefined}
        description={activePipeline.name}
        actions={
          <Segmented<View>
            options={[
              { value: "board", label: "Board" },
              { value: "list", label: "List" },
            ]}
            value={view}
            onChange={setView}
          />
        }
        filters={
          pipelines.length > 1 ? (
            <Segmented<string>
              size="sm"
              options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              value={activePipeline.id}
              onChange={setPipelineId}
            />
          ) : undefined
        }
      />

      {leadsQ.isLoading ? (
        view === "board" ? (
          <BoardSkeleton columns={activePipeline.stages.length || 5} />
        ) : (
          <LeadTableSkeleton />
        )
      ) : leadsQ.isError ? (
        <ErrorState
          title="Couldn't load leads"
          description="The request failed. Try again."
          onRetry={() => void leadsQ.refetch()}
        />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title="No leads in this pipeline"
          description="New leads land here as they come in from your campaigns."
        />
      ) : view === "board" ? (
        <Board
          pipeline={activePipeline}
          leads={leads}
          onOpenLead={openLead}
          onMove={handleMove}
        />
      ) : (
        <LeadTable pipeline={activePipeline} leads={leads} onOpenLead={openLead} />
      )}

      {drawer}
    </div>
  );
}
