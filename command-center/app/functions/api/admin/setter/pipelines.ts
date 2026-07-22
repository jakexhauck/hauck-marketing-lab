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
// Cancelled Appointments, Google Reviews, Reactivation included. So nothing
// here is filtered.

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
  // True when the LIVE stage name matches /needs dialing/i. No mapping
  // table: if the pipeline is renamed in the CRM this flag follows
  // automatically, rather than silently going stale.
  needsDialing: boolean;
}

export interface ApiSetterPipeline {
  id: string;
  name: string;
  stages: ApiSetterStage[];
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
      needsDialing: /needs dialing/i.test(s.name),
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
