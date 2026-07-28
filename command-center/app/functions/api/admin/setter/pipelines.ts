import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";

// GET /api/admin/setter/pipelines?tenantId= (admin-only, gated in
// _middleware.ts). Every pipeline and stage for the client, resolved live
// from the CRM, sorted, unfiltered. Feeds the Setter Suite board's pipeline
// switcher.
//
// Unlike the client-facing PipelinesContext (functions/api/pipelines.ts),
// which hides retired/system stages and pipelines from the client view, an
// admin working the account cross-pipeline needs to see everything: Trash,
// Google Reviews, Reactivation and any client-specific pipeline included. So
// nothing here is filtered.

interface GhlStage {
  id: string;
  name: string;
  position: number;
  color?: string;
}
interface GhlPipeline {
  id: string;
  name: string;
  stages?: GhlStage[];
}
interface PipelinesResponse {
  pipelines: GhlPipeline[];
}

export interface ApiSetterStage {
  id: string;
  name: string;
  color?: string;
  // True when a setter is expected to be working this column.
  //
  // This used to test the stage name for a "(needs dialing)" marker the agency
  // typed into every such stage. The CRM rebuild dropped that marker, which
  // turned the flag false on every stage in the account and quietly switched
  // off the board's dialing signals. It is now derived from what the stage IS:
  // see stageNeedsDialing.
  needsDialing: boolean;
}

export interface ApiSetterPipeline {
  id: string;
  name: string;
  stages: ApiSetterStage[];
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Stages a setter is expected to work: everything inside a dialing pipeline
// (1) Leads, 2) No Answer) except the two parking stages. A lead in Slow Burn
// or Long Term Nurture is on a nurture sequence, not a dialing clock, so
// flagging it would put a permanent "overdue" rail on leads nobody is meant to
// be calling today.
//
// Derived from the live names rather than a mapping table, so a renamed stage
// follows automatically. Mirrors isDialingPipeline in src/lib/setterStageActions.ts;
// the two are deliberately the same rule stated on each side of the wire.
export function stageNeedsDialing(pipelineName: string, stageName: string): boolean {
  const p = normalize(pipelineName);
  const dialingPipeline = /\bleads?\b/.test(p) || p.includes("no answer");
  if (!dialingPipeline) return false;
  const s = normalize(stageName);
  if (s.includes("nurture") || s.includes("slow burn")) return false;
  return true;
}

// Pure: sort a pipeline's stages by their live `position` and flag which ones
// need a dial. No I/O, so this is the unit-testable core of the route.
export function shapeSetterPipeline(p: GhlPipeline): ApiSetterPipeline {
  const stages = [...(p.stages ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      needsDialing: stageNeedsDialing(p.name, s.name),
    }));
  return { id: p.id, name: p.name, stages };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const data = await ghlJson<PipelinesResponse>(
      gctx,
      `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
    );
    const pipelines = (data.pipelines ?? []).map(shapeSetterPipeline);
    // locationId rides along so the cockpit can build a link to a lead's CRM
    // contact record, which is how a setter dials from the client's business
    // number instead of their own handset (src/lib/setterModel.ts:ghlContactUrl).
    // It goes here rather than on a new endpoint because the tenant's GHL
    // context is already resolved above, once per client selection. Not a
    // secret: it is visible in every CRM URL, and this route is admin-gated.
    return Response.json({ pipelines, locationId: gctx.locationId });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
