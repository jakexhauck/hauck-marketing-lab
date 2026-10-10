import type { Env, ApiData } from "../../../lib/env";
import { tenantTimezone } from "../../../lib/env";
import { ghlJson, type GhlContext, type GhlOpportunity } from "../../../lib/ghl";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { putOpportunity } from "../../lib/writes";
import { planMove, type MoveInput } from "../../../lib/leadBoard";
import { copyBookingToContact, loadBoardPipeline } from "../../../lib/leadBoardGhl";
import { applyPlanWrites, loadTenantForBoard } from "../../../lib/leadBoardStore";

// POST /api/pipeline-board/:id/move  { stageId, at?, note?, value?, lostReason? }
//
// One endpoint for every drop and every tap, so the rules cannot differ
// between desktop drag and phone tap. Order matters:
//   1. plan (lib/leadBoard.ts): refuses a move missing what its stage needs
//   2. GHL stage move: if GHL refuses, nothing is written and the card snaps back
//   3. app rows (0150): bookings, follow-up, lost reason, won amount
//   4. copy a booking's date to the contact's fields (best effort, reminders)

export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const id = String(ctx.params.id);
  const body = await readJsonBody<MoveInput>(ctx.request);
  if (!body || typeof body.stageId !== "string") return Response.json({ error: "invalid body" }, { status: 400 });

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const tenant = await loadTenantForBoard(client, t.slug, tenantTimezone(ctx.env));
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const board = await loadBoardPipeline(gctx);
  if (!board) return Response.json({ error: "pipeline_not_found" }, { status: 409 });

  const plan = planMove(board.stages, body);
  if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 });

  // The opportunity must sit on this board: a stage id from one pipeline must
  // never be pushed onto an opportunity in another.
  const { opportunity: opp } = await ghlJson<{ opportunity?: GhlOpportunity }>(
    gctx,
    `/opportunities/${encodeURIComponent(id)}`,
  );
  if (!opp || opp.pipelineId !== board.pipelineId) {
    return Response.json({ error: "not_on_board" }, { status: 404 });
  }
  const contactId = opp.contactId ?? opp.contact?.id ?? null;

  const moved = await putOpportunity(gctx, id, plan.ghl);
  if (!moved.ok) return Response.json({ error: "ghl_error", status: moved.status }, { status: 502 });

  const by = ctx.data.staff?.name ?? "owner";
  await applyPlanWrites(client, { tenantId: tenant.id, opportunityId: id, contactId, by, zone: tenant.zone }, plan);

  let reminderCopied: boolean | null = null;
  if (plan.booking && contactId) {
    reminderCopied = await copyBookingToContact(gctx, contactId, plan.booking.kind, plan.booking.startsAt, tenant.zone);
  }

  return Response.json({ ok: true, reminderCopied });
};
