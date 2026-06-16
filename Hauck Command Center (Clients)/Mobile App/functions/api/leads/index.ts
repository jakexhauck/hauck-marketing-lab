import type { Env, ApiData } from "../../lib/env";
import { fetchAllOpportunities, shapeOpportunity } from "../../lib/ghl";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const url = new URL(ctx.request.url);
  const pipelineId = url.searchParams.get("pipelineId");

  const all = await fetchAllOpportunities(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    { pipelineId },
  );

  const leads = all.map(shapeOpportunity);
  leads.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({ leads, total: leads.length });
};
