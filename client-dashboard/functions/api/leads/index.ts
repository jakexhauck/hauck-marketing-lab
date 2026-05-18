import type { Env, ApiData } from "../../lib/env";
import { ghlJson, shapeOpportunity, type GhlOpportunity } from "../../lib/ghl";

interface SearchResponse {
  opportunities: GhlOpportunity[];
  meta?: { total?: number };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const data = await ghlJson<SearchResponse>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/opportunities/search?location_id=${encodeURIComponent(t.ghl_location_id)}&limit=100`,
  );

  const leads = (data.opportunities ?? []).map(shapeOpportunity);
  leads.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({ leads, total: data.meta?.total ?? leads.length });
};
