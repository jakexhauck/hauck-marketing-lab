// Shared write helpers for the action-wiring surfaces (Jobs "mark completed",
// Leads off-ramp, and the appointment/invoice writes that land in later phases).
// Kept out of functions/lib/ghl.ts so parallel feature builds never collide on
// that shared file; anything here is specific to writing opportunities/stages.
//
// The one rule these enforce: pipelines and stages are resolved BY NAME per
// tenant (exact match then a looser contains), never by hardcoded id, mirroring
// the read-side resolvers in functions/api/sales/*.

import { ghlFetch, ghlJson, type GhlContext } from "../../lib/ghl";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve a stage id by (pipeline name, stage name). Both match exact first then
// contains, so a small rename in GHL still resolves. Returns the pipeline id it
// matched alongside the stage id (null stage if nothing matched), so callers can
// fall back to a status-only write when the named stage is absent.
export async function resolveStageByName(
  gctx: GhlContext,
  pipelineName: string,
  stageName: string,
): Promise<{ pipelineId: string | null; stageId: string | null }> {
  const data = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const pipes = data.pipelines ?? [];
  const wantPipe = norm(pipelineName);
  const pipe =
    pipes.find((p) => norm(p.name) === wantPipe) ??
    pipes.find((p) => norm(p.name).includes(wantPipe));
  if (!pipe) return { pipelineId: null, stageId: null };

  const wantStage = norm(stageName);
  const stage =
    pipe.stages.find((s) => norm(s.name) === wantStage) ??
    pipe.stages.find((s) => norm(s.name).includes(wantStage));
  return { pipelineId: pipe.id, stageId: stage?.id ?? null };
}

// Resolve a stage id by name WITHIN a known pipeline id (used when we already
// have the opportunity's pipeline and only need to translate a stage name).
export async function resolveStageInPipeline(
  gctx: GhlContext,
  pipelineId: string,
  stageName: string,
): Promise<string | null> {
  const data = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const pipe = (data.pipelines ?? []).find((p) => p.id === pipelineId);
  if (!pipe) return null;
  const want = norm(stageName);
  const stage =
    pipe.stages.find((s) => norm(s.name) === want) ??
    pipe.stages.find((s) => norm(s.name).includes(want));
  return stage?.id ?? null;
}

// PUT an opportunity with the given writable fields (stage move and/or status).
// Returns { ok } plus the GHL status + a trimmed body on failure, so the caller
// can surface a 502 with a real reason instead of a bare error.
export async function putOpportunity(
  gctx: GhlContext,
  opportunityId: string,
  fields: { pipelineStageId?: string; status?: string; monetaryValue?: number },
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const res = await ghlFetch(
    gctx,
    `/opportunities/${encodeURIComponent(opportunityId)}`,
    { method: "PUT", body: JSON.stringify(fields) },
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body: body.slice(0, 500) };
  }
  return { ok: true };
}

// POST a brand-new opportunity for a contact that has none yet: the unknown
// inbound caller who becomes a bare GHL contact, then logs a terminal call
// outcome that needs a pipeline stage to land in. Mirrors putOpportunity's
// return shape so callers surface the same 502-with-reason on failure.
export async function createOpportunity(
  gctx: GhlContext,
  input: {
    pipelineId: string;
    pipelineStageId: string;
    contactId: string;
    name: string;
    monetaryValue?: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; status: number; body: string }> {
  const body: Record<string, unknown> = {
    pipelineId: input.pipelineId,
    locationId: gctx.locationId,
    pipelineStageId: input.pipelineStageId,
    contactId: input.contactId,
    name: input.name,
    status: "open",
  };
  if (typeof input.monetaryValue === "number") body.monetaryValue = input.monetaryValue;
  const res = await ghlFetch(gctx, `/opportunities/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 500) };
  }
  const data = (await res.json()) as { opportunity?: { id?: string }; id?: string };
  const id = data.opportunity?.id ?? data.id ?? "";
  return { ok: true, id };
}
