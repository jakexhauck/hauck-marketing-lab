import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { shapeOpportunity, type RawOpportunity } from "../../../lib/agencyPipelines";

// GET /api/admin/cold-call/pipelines            -> every pipeline and its stages
// GET /api/admin/cold-call/pipelines?id=<id>    -> that pipeline's cards too
//
// Read only, and read LIVE. Nothing about a pipeline is stored on our side: the
// boards are Jake's, moved by his automations, and a cached copy would show a
// caller a card in a stage it left ten minutes ago. The cost of that honesty is
// a request to GHL per view, which for a handful of pipelines is nothing.
//
// The app never writes here. Opportunities are created and moved by the
// workflows in that account, which is the whole arrangement: the console tags,
// GHL decides what the tag means.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({ configured: false, pipelines: [] });
  }

  const agency = getAgencyGhlContext(ctx.env);
  const url = new URL(ctx.request.url);
  const wanted = (url.searchParams.get("id") ?? "").trim();

  try {
    const res = await ghlJson<{ pipelines?: RawPipeline[] }>(
      agency,
      `/opportunities/pipelines?locationId=${encodeURIComponent(agency.locationId)}`,
    );
    const pipelines = (res.pipelines ?? []).map(shapePipeline);

    if (!wanted) return Response.json({ configured: true, pipelines });

    // The board for one pipeline. 100 is GHL's page cap and far more than these
    // pipelines hold; a bigger book would want paging, and would say so by
    // showing exactly 100 cards.
    const cards = await ghlJson<{ opportunities?: RawOpportunity[] }>(
      agency,
      `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
        `&pipeline_id=${encodeURIComponent(wanted)}&limit=100`,
    );

    return Response.json({
      configured: true,
      pipelines,
      opportunities: (cards.opportunities ?? []).map(shapeOpportunity),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not reach GoHighLevel";
    return Response.json({ error: message.slice(0, 300) }, { status: 502 });
  }
};

interface RawPipeline {
  id: string;
  name: string;
  stages?: { id: string; name: string; position?: number }[];
}

// Stages come back in GHL's own order, which is the order they are drawn in the
// CRM. Sorted by position anyway, so the board can never disagree with what Jake
// sees over there.
function shapePipeline(p: RawPipeline) {
  return {
    id: p.id,
    name: p.name,
    stages: (p.stages ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((s) => ({ id: s.id, name: s.name })),
  };
}
