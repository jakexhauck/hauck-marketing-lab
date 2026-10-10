import type { Env, ApiData } from "../../../lib/env";
import { tenantTimezone } from "../../../lib/env";
import { ghlJson, type GhlContext, type GhlOpportunity } from "../../../lib/ghl";
import { getServiceClient } from "../../../lib/supabase";
import { zonedTimeToUtcMs } from "../../../lib/tz";
import { putOpportunity } from "../../lib/writes";
import { planMove } from "../../../lib/leadBoard";
import { loadBoardPipeline } from "../../../lib/leadBoardGhl";
import { applyPlanWrites, bumpAttempts, loadTenantForBoard, zonedDate } from "../../../lib/leadBoardStore";

// POST /api/pipeline-board/:id/no-answer
//
// The one-tap answer after a call that went unanswered: +1 attempt, follow-up
// tomorrow at 10am in the client's zone, lead into Follow Up. Same order as
// move: GHL first, app rows only after GHL said yes.

const FOLLOW_UP_HOUR = 10;

export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const id = String(ctx.params.id);

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const tenant = await loadTenantForBoard(client, t.slug, tenantTimezone(ctx.env));
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const board = await loadBoardPipeline(gctx);
  if (!board) return Response.json({ error: "pipeline_not_found" }, { status: 409 });
  const followStage = board.stages.find((s) => s.key === "followUp");
  if (!followStage) return Response.json({ error: "pipeline_not_found" }, { status: 409 });

  const { opportunity: opp } = await ghlJson<{ opportunity?: GhlOpportunity }>(
    gctx,
    `/opportunities/${encodeURIComponent(id)}`,
  );
  if (!opp || opp.pipelineId !== board.pipelineId) {
    return Response.json({ error: "not_on_board" }, { status: 404 });
  }
  const contactId = opp.contactId ?? opp.contact?.id ?? null;

  const tomorrow = zonedDate(Date.now() + 86_400_000, tenant.zone);
  const dueMs = zonedTimeToUtcMs(tenant.zone, tomorrow, FOLLOW_UP_HOUR, 0);
  if (dueMs === null) return Response.json({ error: "bad date" }, { status: 500 });

  const attemptsBefore = await client
    .from("lead_outcomes")
    .select("attempts")
    .eq("tenant_id", tenant.id)
    .eq("ghl_opportunity_id", id)
    .maybeSingle();
  const next = ((attemptsBefore.data?.attempts as number | undefined) ?? 0) + 1;

  const plan = planMove(board.stages, {
    stageId: followStage.id,
    at: new Date(dueMs).toISOString(),
    note: `No answer (${next})`,
  });
  if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 });

  const moved = await putOpportunity(gctx, id, plan.ghl);
  if (!moved.ok) return Response.json({ error: "ghl_error", status: moved.status }, { status: 502 });

  const by = ctx.data.staff?.name ?? "owner";
  await applyPlanWrites(client, { tenantId: tenant.id, opportunityId: id, contactId, by, zone: tenant.zone }, plan);
  const attempts = await bumpAttempts(client, tenant.id, id);

  return Response.json({ ok: true, attempts, followUpAt: new Date(dueMs).toISOString() });
};
