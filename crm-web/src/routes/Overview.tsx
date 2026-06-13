import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel, PanelHeader, Segmented, ErrorState, LoadingState } from "@/components/ui";
import { useTenant } from "@/context/TenantContext";
import {
  useSummaryQuery,
  usePipelinesQuery,
  useActivityQuery,
  useCalendarEventsQuery,
  useConversationsQuery,
} from "@/hooks/useApi";
import { StatStrip, StatStripSkeleton } from "@/components/overview/StatStrip";
import { PipelineRibbon } from "@/components/overview/PipelineRibbon";
import { ActivityFeed } from "@/components/overview/ActivityFeed";
import { UpcomingAppointments } from "@/components/overview/UpcomingAppointments";
import { NeedsAttention } from "@/components/overview/NeedsAttention";

export function Overview() {
  const { monthlySpend, appName } = useTenant();

  const summaryQuery = useSummaryQuery();
  const pipelinesQuery = usePipelinesQuery();
  const activityQuery = useActivityQuery();
  const calendarQuery = useCalendarEventsQuery();
  const conversationsQuery = useConversationsQuery();

  const pipelines = pipelinesQuery.data?.pipelines ?? [];

  // Order pipelines by their real lead total (from summary) so the switcher and
  // default selection both reflect "largest funnel first". Pipelines missing
  // from the summary sort last with a total of 0.
  const orderedPipelines = useMemo(() => {
    const totals = new Map(summaryQuery.data?.pipelines.map((p) => [p.id, p.total]) ?? []);
    return [...pipelines]
      .map((p) => ({ pipeline: p, total: totals.get(p.id) ?? 0 }))
      .sort((a, b) => b.total - a.total);
  }, [pipelines, summaryQuery.data]);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Default to the largest pipeline once data lands; keep the user's choice
  // after that, but recover if the selected pipeline disappears.
  useEffect(() => {
    if (orderedPipelines.length === 0) return;
    const stillValid = activeId && orderedPipelines.some((p) => p.pipeline.id === activeId);
    if (stillValid) return;
    // Wait for the summary totals before locking a default, otherwise the sort
    // is all-zeros and we'd open on the first pipeline instead of the busiest.
    if (summaryQuery.isLoading) return;
    setActiveId(orderedPipelines[0].pipeline.id);
  }, [orderedPipelines, activeId, summaryQuery.isLoading]);

  const activePipeline = orderedPipelines.find((p) => p.pipeline.id === activeId)?.pipeline ?? null;

  const headReady = !summaryQuery.isLoading && !pipelinesQuery.isLoading;
  const headError = summaryQuery.isError || pipelinesQuery.isError;

  return (
    <div className="pb-8">
      <PageHeader
        title="Overview"
        description={`${appName} at a glance: pipeline health, today's pulse, and what needs you.`}
      />

      {/* ===== Hero: live pipeline ribbon ===== */}
      <Panel className="mb-5 overflow-hidden">
        <PanelHeader
          kicker="Pipeline funnel"
          title={activePipeline ? activePipeline.name : "Pipeline funnel"}
          action={
            orderedPipelines.length > 1 ? (
              <Segmented
                size="sm"
                value={activeId ?? orderedPipelines[0]?.pipeline.id ?? ""}
                onChange={setActiveId}
                options={orderedPipelines.map(({ pipeline, total }) => ({
                  value: pipeline.id,
                  label: pipeline.name,
                  count: total,
                }))}
              />
            ) : undefined
          }
        />
        <div className="p-4 sm:p-5">
          {headError ? (
            <ErrorState
              title="Could not load pipelines"
              description="Pipeline data failed to load."
              onRetry={() => {
                summaryQuery.refetch();
                pipelinesQuery.refetch();
              }}
            />
          ) : !headReady || !activePipeline ? (
            <LoadingState label="Loading pipeline" />
          ) : (
            <PipelineRibbon pipeline={activePipeline} />
          )}
        </div>
      </Panel>

      {/* ===== Stat strip ===== */}
      <div className="mb-5">
        {summaryQuery.isLoading ? (
          <StatStripSkeleton cells={monthlySpend != null ? 6 : 5} />
        ) : summaryQuery.isError ? (
          <Panel className="overflow-hidden">
            <ErrorState
              title="Could not load today's numbers"
              onRetry={() => summaryQuery.refetch()}
            />
          </Panel>
        ) : summaryQuery.data ? (
          <StatStrip summary={summaryQuery.data} monthlySpend={monthlySpend} />
        ) : null}
      </div>

      {/* ===== Lower grid: feed + schedule/attention ===== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <ActivityFeed
          activity={activityQuery.data?.activity}
          isLoading={activityQuery.isLoading}
          isError={activityQuery.isError}
          onRetry={() => activityQuery.refetch()}
        />

        <div className="flex flex-col gap-5">
          <UpcomingAppointments
            events={calendarQuery.data?.events}
            isLoading={calendarQuery.isLoading}
            isError={calendarQuery.isError}
            onRetry={() => calendarQuery.refetch()}
          />
          <NeedsAttention conversations={conversationsQuery.data?.conversations} />
        </div>
      </div>
    </div>
  );
}
