import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { ghlJson, type GhlContext, type GhlOpportunity } from "../../../../lib/ghl";
import { resolveStageInPipeline, putOpportunity } from "../../../lib/writes";

// POST /api/sales/leads/:id/stage: the one write behind the Leads worklist
// off-ramp (and, later, the manual Confirm). Keeps stage-name knowledge
// server-side so the client never hardcodes ids.
//
// Body: { status?, stageName? }
//  - status: "open" | "won" | "lost" | "abandoned" (the off-ramp sends "lost").
//  - stageName: resolved BY NAME within the opportunity's own pipeline, exact
//    then contains, so a small GHL rename still lands. Ignored if it does not
//    resolve (the status write, if any, still goes through).

interface StageBody {
  status?: "open" | "won" | "lost" | "abandoned";
  stageName?: string;
}

export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const id = ctx.params.id as string;

  const body = await readJsonBody<StageBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const fields: { pipelineStageId?: string; status?: string } = {};
  if (body.status) fields.status = body.status;

  if (body.stageName) {
    // Need the opportunity's pipeline to translate the stage name to an id.
    const data = await ghlJson<{ opportunity: GhlOpportunity }>(
      gctx,
      `/opportunities/${encodeURIComponent(id)}`,
    );
    const pipelineId = data.opportunity?.pipelineId ?? "";
    if (pipelineId) {
      const stageId = await resolveStageInPipeline(gctx, pipelineId, body.stageName);
      if (stageId) fields.pipelineStageId = stageId;
    }
  }

  if (!fields.status && !fields.pipelineStageId) {
    return Response.json({ error: "nothing_to_write" }, { status: 400 });
  }

  const result = await putOpportunity(gctx, id, fields);
  if (!result.ok) {
    return Response.json(
      { error: "ghl_error", status: result.status, body: result.body },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
};
