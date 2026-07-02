import type { Env, ApiData } from "../../../../lib/env";
import { type GhlContext } from "../../../../lib/ghl";
import { resolveStageByName, putOpportunity } from "../../../lib/writes";

// POST /api/sales/jobs/:id/complete: move a booked job's opportunity to the
// "Job Completed" stage of the Sales Pipeline. The stage id differs per tenant,
// so it is resolved BY NAME here (server-side) and never sent from the client,
// mirroring the read-side resolver in functions/api/sales/jobs/index.ts.

const SALES_PIPELINE_NAME = "sales pipeline";
const JOB_COMPLETED_NAME = "job completed";

export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const id = ctx.params.id as string;

  const { stageId } = await resolveStageByName(
    gctx,
    SALES_PIPELINE_NAME,
    JOB_COMPLETED_NAME,
  );
  if (!stageId) {
    return Response.json(
      { error: "stage_not_found", stage: JOB_COMPLETED_NAME },
      { status: 422 },
    );
  }

  const result = await putOpportunity(gctx, id, { pipelineStageId: stageId });
  if (!result.ok) {
    return Response.json(
      { error: "ghl_error", status: result.status, body: result.body },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, status: "completed" });
};
