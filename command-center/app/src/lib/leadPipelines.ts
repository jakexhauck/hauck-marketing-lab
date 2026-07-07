import type { ApiPipelineSummary } from "./api";

export type LeadPipelineKind = "sales" | "trash";

// Per-kind matchers. Names are matched case-insensitively (exact, then
// contains); the id is the last-resort fallback for the known Willis template
// when a cloned account renames the pipeline.
const MATCH: Record<
  LeadPipelineKind,
  { exact: string; contains: string; fallbackId: string }
> = {
  sales: { exact: "sales", contains: "sales", fallbackId: "6o9Gx6e0TXRFJdln5d01" },
  trash: { exact: "trash", contains: "trash", fallbackId: "TtKcHZeAtljinJik9kK5" },
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve the tenant's Sales or Trash pipeline from its full pipeline list.
export function resolveLeadPipeline(
  pipelines: ApiPipelineSummary[],
  kind: LeadPipelineKind,
): ApiPipelineSummary | null {
  const m = MATCH[kind];
  return (
    pipelines.find((p) => norm(p.name) === m.exact) ??
    pipelines.find((p) => norm(p.name).includes(m.contains)) ??
    pipelines.find((p) => p.id === m.fallbackId) ??
    null
  );
}
