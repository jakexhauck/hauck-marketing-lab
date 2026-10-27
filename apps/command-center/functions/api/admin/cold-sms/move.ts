import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlFetch } from "../../../lib/ghl";
import { boardGhl } from "../../../lib/boardGhl";
import { listPipelines } from "../../../lib/coldSmsAgency";

// POST /api/admin/cold-sms/move  { opportunityId, pipelineId, stageId }  (owner only)
//
// A card dragged to another column, or sent to another pipeline from the panel
// (Sales > Call Booked). Written straight to GHL, which is the board's only
// store: the next read shows it wherever GHL says it is.
//
// The target is checked against GHL's live pipelines first, so a stale board
// cannot park a card in a stage that was deleted.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const board = await boardGhl(ctx.env, ctx.request);
  if (board instanceof Response) return board;
  if (!board) return Response.json({ error: "not_configured" }, { status: 503 });
  const body = await readJsonBody<{ opportunityId?: unknown; pipelineId?: unknown; stageId?: unknown }>(ctx.request);
  const opportunityId = typeof body?.opportunityId === "string" ? body.opportunityId.trim() : "";
  const pipelineId = typeof body?.pipelineId === "string" ? body.pipelineId.trim() : "";
  const stageId = typeof body?.stageId === "string" ? body.stageId.trim() : "";
  if (!opportunityId || !pipelineId || !stageId) return Response.json({ error: "missing_fields" }, { status: 400 });

  const ghl = board.ghl;
  try {
    const pipelines = await listPipelines(ghl);
    const ok = pipelines.some((p) => p.id === pipelineId && p.stages.some((s) => s.id === stageId));
    if (!ok) return Response.json({ error: "unknown_stage" }, { status: 400 });
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }

  const res = await ghlFetch(ghl, `/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: "PUT",
    body: JSON.stringify({ pipelineId, pipelineStageId: stageId }),
  });
  if (!res.ok) {
    console.error("[cold-sms/move]", res.status, (await res.text()).slice(0, 300));
    return Response.json({ error: "move_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
};
