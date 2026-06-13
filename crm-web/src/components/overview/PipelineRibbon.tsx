import { useMemo } from "react";
import { Layers } from "lucide-react";
import { Panel, Skeleton, EmptyState, ErrorState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useLeadsQuery } from "@/hooks/useApi";
import type { ApiPipelineSummary } from "@hauck/core";

// A deterministic palette built only from token-driven brand/state tints so the
// funnel themes with the tenant. No hardcoded hex. Earlier stages read as the
// brand signal; later stages graduate toward "won" positive territory.
const SEGMENT_TONES = [
  "bg-[color-mix(in_srgb,var(--brand)_28%,transparent)]",
  "bg-[color-mix(in_srgb,var(--brand)_45%,transparent)]",
  "bg-[color-mix(in_srgb,var(--brand)_65%,transparent)]",
  "bg-[color-mix(in_srgb,var(--brand)_85%,transparent)]",
  "bg-brand",
];

function toneFor(index: number, total: number): string {
  if (total <= 1) return SEGMENT_TONES[SEGMENT_TONES.length - 1];
  // Map this stage's position across the funnel onto the palette range.
  const t = index / (total - 1);
  const slot = Math.min(
    SEGMENT_TONES.length - 1,
    Math.round(t * (SEGMENT_TONES.length - 1)),
  );
  return SEGMENT_TONES[slot];
}

export function PipelineRibbon({
  pipeline,
}: {
  pipeline: ApiPipelineSummary;
}) {
  const leadsQuery = useLeadsQuery(pipeline.id);

  const stageRows = useMemo(() => {
    const leads = leadsQuery.data?.leads ?? [];
    const counts = new Map<string, number>();
    for (const lead of leads) {
      counts.set(lead.pipelineStageId, (counts.get(lead.pipelineStageId) ?? 0) + 1);
    }
    const total = leads.length;
    return pipeline.stages.map((stage, i) => {
      const count = counts.get(stage.id) ?? 0;
      return {
        id: stage.id,
        name: stage.name,
        count,
        share: total > 0 ? count / total : 0,
        tone: toneFor(i, pipeline.stages.length),
      };
    });
  }, [leadsQuery.data, pipeline]);

  const total = leadsQuery.data?.leads.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {leadsQuery.isLoading ? (
        <RibbonSkeleton />
      ) : leadsQuery.isError ? (
        <Panel className="overflow-hidden">
          <ErrorState
            title="Could not load the funnel"
            description="The pipeline's leads failed to load."
            onRetry={() => leadsQuery.refetch()}
          />
        </Panel>
      ) : total === 0 ? (
        <Panel className="overflow-hidden">
          <EmptyState
            icon={<Layers size={22} />}
            title="No leads in this pipeline yet"
            description="As leads arrive they will fan out across the stages here."
          />
        </Panel>
      ) : (
        <>
          {/* The proportional bar: each stage a segment sized by its share. */}
          <div className="flex h-14 w-full overflow-hidden rounded-[var(--radius)] border border-border bg-surface-2">
            {stageRows.map((s) =>
              s.count === 0 ? null : (
                <div
                  key={s.id}
                  className={cn(
                    "group relative flex min-w-[2px] items-center overflow-hidden border-r border-bg/40 transition-[flex-grow] last:border-r-0",
                    s.tone,
                  )}
                  style={{ flexGrow: s.share, flexBasis: 0 }}
                  title={`${s.name}: ${s.count}`}
                >
                  <div className="truncate px-2.5">
                    <div className="truncate text-[11px] font-semibold text-brand-fg/90">
                      {s.name}
                    </div>
                    <div className="font-data text-[12px] leading-tight text-brand-fg tnum">
                      {formatNumber(s.count)}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {/* Legend / readout so every stage is labelled even when its segment
              is too thin to hold text. */}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {stageRows.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[2px]", s.tone)} aria-hidden />
                <span className="text-[12.5px] text-muted">{s.name}</span>
                <span className="font-data text-[12.5px] text-text tnum">
                  {formatNumber(s.count)}
                </span>
                <span className="font-data text-[11px] text-faint tnum">
                  {Math.round(s.share * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RibbonSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-14 w-full rounded-[var(--radius)]" />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24" />
        ))}
      </div>
    </div>
  );
}
