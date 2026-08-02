import type { Env, ApiData } from "../../lib/env";
import { ghlJson, fetchAllOpportunities, type GhlContext } from "../../lib/ghl";
import { organicChannel, resolveOrganicPipeline, type OrganicChannel } from "../../lib/organic";

// GET /api/organic
//   -> { available, stages, leads } : every opportunity in the tenant's Organic
//      pipeline, classified by stage into the page's two columns.
//
// GET /api/organic?probe=1
//   -> { available } : does this tenant have an Organic pipeline at all. One GHL
//      call instead of two, because the nav asks this on every page load to
//      decide whether to render the Organic row. Clients whose website we do not
//      manage have no such pipeline and never see the row.
//
// Deliberately no fallback pipeline id: an id belongs to one location, so
// guessing one for another tenant would show them somebody else's page shape.
// Not found means not available.

export interface ApiOrganicLead {
  // The opportunity id. Unique per row; the contact id is the join key for
  // detail, and is NOT unique (one contact can hold two organic cards).
  id: string;
  contactId: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
  // Verbatim GHL stage name, so the UI can label a row that landed in a stage
  // it does not recognise.
  stageName: string;
  channel: OrganicChannel;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const probeOnly = new URL(ctx.request.url).searchParams.get("probe") === "1";

  const pipeData = await ghlJson<{ pipelines?: { id: string; name?: string; stages?: { id: string; name?: string }[] }[] }>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const pipeline = resolveOrganicPipeline(pipeData.pipelines ?? []);

  if (!pipeline) {
    return Response.json({ available: false, stages: [], leads: [] });
  }
  if (probeOnly) {
    return Response.json({ available: true });
  }

  const opps = await fetchAllOpportunities(gctx, { pipelineId: pipeline.pipelineId });

  const leads: ApiOrganicLead[] = opps.map((o) => {
    const stageName = pipeline.stageNames.get(o.pipelineStageId ?? "") ?? "";
    return {
      id: o.id,
      contactId: o.contact?.id ?? o.contactId ?? "",
      name:
        o.contact?.name ||
        [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim() ||
        o.name ||
        "Unknown",
      phone: o.contact?.phone ?? "",
      email: o.contact?.email ?? "",
      createdAt: o.createdAt ?? "",
      stageName,
      channel: organicChannel(stageName),
    };
  });
  // Newest first: this page is read top-down every morning.
  leads.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  // The tenant's own stage names, in GHL order, so column headers read exactly
  // as the pipeline does rather than as hardcoded English.
  const stages = [...pipeline.stageNames.values()].filter(Boolean);

  return Response.json({ available: true, stages, leads });
};
