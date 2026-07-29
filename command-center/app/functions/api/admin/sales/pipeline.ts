import type { Env, ApiData } from "../../../lib/env";
import { fetchAllOpportunities } from "../../../lib/ghl";
import { getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { groupByStage, shapeOpportunity } from "../../../lib/agencyPipelines";
import { resolveAgencySalesPipeline } from "../../lib/agencySales";

// GET /api/admin/sales/pipeline -> the agency's own Sales board, as a board.
//
// Sales > Sales Pipeline. Sales Calls is the meetings and it is worked: every
// row there is a question waiting for an answer. This is the board those
// answers land on, and it is read, not worked. Nothing here writes: the cards
// are moved by Jake's own workflows, firing on the tags the Sales Calls buttons
// apply, and a second place to drag them is how a pipeline starts disagreeing
// with itself.
//
// Read LIVE every time, same as Cold Call > Pipelines and for the same reason:
// a cached column is a card sitting somewhere it has already left.
//
// Owner only. The pillar's tab list already refuses a cold caller (ROLE_TABS in
// PillarPage) and adminRoles.ts grants no non-owner role anything under
// /api/admin/sales, but this refuses them on its own account too, because a UI
// that hides a page is not a permission.

// Five pages of 100. The board holds every sales meeting the agency has ever
// run, so it grows forever, but 500 cards is far beyond what anybody reads down
// a column and the cap is reported rather than hidden.
const MAX_PAGES = 5;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (!(err instanceof AgencyGhlError)) throw err;
    // Not an error state: the account simply is not connected, and the page
    // says so rather than showing an empty board that looks like no sales.
    return Response.json({ configured: false, pipeline: null, columns: [], truncated: false });
  }

  try {
    const pipeline = await resolveAgencySalesPipeline(gctx);
    if (!pipeline) {
      return Response.json({ configured: true, pipeline: null, columns: [], truncated: false });
    }

    const truncated = { value: false };
    const opportunities = await fetchAllOpportunities(gctx, {
      pipelineId: pipeline.id,
      maxPages: MAX_PAGES,
      truncated,
    });

    // GhlOpportunity is already the shape shapeOpportunity reads, so the same
    // card mapping Cold Call > Pipelines uses is reused verbatim rather than a
    // second one drifting beside it.
    const columns = groupByStage(pipeline.stages, opportunities.map(shapeOpportunity));

    return Response.json({
      configured: true,
      pipeline: {
        id: pipeline.id,
        name: pipeline.name,
        // Stages the buttons expect that this board has no column for. Shown
        // on the page, because a missing column is why a workflow would have
        // nowhere to move an outcome to.
        missing: pipeline.missing,
      },
      // The location rides along so a card can link to its contact in the CRM.
      // Not a secret: it is in every GoHighLevel URL, and this route is
      // owner-gated.
      locationId: gctx.locationId,
      columns,
      truncated: truncated.value,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not reach GoHighLevel";
    return Response.json({ error: message.split("\n")[0].slice(0, 300) }, { status: 502 });
  }
};
