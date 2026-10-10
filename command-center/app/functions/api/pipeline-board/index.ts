import type { Env, ApiData } from "../../lib/env";
import { tenantTimezone } from "../../lib/env";
import { fetchAllOpportunities, type GhlContext } from "../../lib/ghl";
import { getServiceClient } from "../../lib/supabase";
import { loadBoardPipeline } from "../../lib/leadBoardGhl";
import { loadBoardRows, loadTenantForBoard } from "../../lib/leadBoardStore";

// GET /api/pipeline-board (owner endpoint): the Leads board.
//
// Stages come live from the client's GHL "Sales Pipeline" (found by its stage
// names, see lib/leadBoard.ts), in GHL's order and colours. Each lead is an
// opportunity on it, joined to what the app holds: the scheduled booking, the
// open follow-up, the lost reason and call attempts (0150).
//
// No board pipeline => { configError: "pipeline_not_found" }, and the Leads
// page keeps the old board. That is how Willis and Made Better stay put.

export interface BoardLead {
  id: string;
  contactId: string | null;
  name: string;
  phone: string;
  createdAt: string;
  stageId: string;
  value: number | null;
  bookings: { kind: "estimate" | "job"; at: string }[];
  followUp: { at: string; note: string } | null;
  lostReason: string | null;
  attempts: number;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const tenant = await loadTenantForBoard(client, t.slug, tenantTimezone(ctx.env));
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const board = await loadBoardPipeline(gctx);
  if (!board) return Response.json({ stages: [], leads: [], configError: "pipeline_not_found" });

  const [opps, rows] = await Promise.all([
    fetchAllOpportunities(gctx, { pipelineId: board.pipelineId }),
    loadBoardRows(client, tenant.id),
  ]);

  const bookingsBy = new Map<string, BoardLead["bookings"]>();
  for (const b of rows.bookings) {
    const list = bookingsBy.get(b.ghl_opportunity_id) ?? [];
    list.push({ kind: b.kind, at: b.starts_at });
    bookingsBy.set(b.ghl_opportunity_id, list);
  }
  const followBy = new Map(rows.followups.map((f) => [f.ghl_opportunity_id, f]));
  const outcomeBy = new Map(rows.outcomes.map((o) => [o.ghl_opportunity_id, o]));

  const leads: BoardLead[] = opps
    .filter((o) => o.pipelineStageId)
    .map((o) => {
      const fu = followBy.get(o.id);
      const oc = outcomeBy.get(o.id);
      return {
        id: o.id,
        contactId: o.contactId ?? o.contact?.id ?? null,
        name: o.contact?.name || o.name || "Lead",
        phone: o.contact?.phone ?? "",
        createdAt: o.createdAt ?? new Date(0).toISOString(),
        stageId: o.pipelineStageId as string,
        value: typeof o.monetaryValue === "number" && o.monetaryValue > 0 ? o.monetaryValue : null,
        bookings: bookingsBy.get(o.id) ?? [],
        followUp: fu ? { at: fu.due_at, note: fu.note } : null,
        lostReason: oc?.lost_reason ?? null,
        attempts: oc?.attempts ?? 0,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return Response.json({
    stages: board.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, key: s.key })),
    leads,
    timezone: tenant.zone,
  });
};
