import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllOpportunities, type GhlContext } from "./ghl";
import { loadBoardPipeline } from "./leadBoardGhl";
import { loadBoardRows, loadTenantForBoard } from "./leadBoardStore";

// The Leads board read, shared by the owner endpoint (GET /api/pipeline-board)
// and the admin Setting tab (GET /api/admin/clients/:id/setting/board), so both
// show the same Sales Pipeline the same way.

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

export type BoardRead =
  | { ok: true; body: unknown }
  | { ok: false; status: number; body: unknown };

export async function readBoard(
  client: SupabaseClient,
  gctx: GhlContext,
  slug: string,
  fallbackZone: string,
): Promise<BoardRead> {
  const tenant = await loadTenantForBoard(client, slug, fallbackZone);
  if (!tenant) return { ok: false, status: 404, body: { error: "tenant not found" } };

  const board = await loadBoardPipeline(gctx);
  if (!board) return { ok: true, body: { stages: [], leads: [], configError: "pipeline_not_found" } };

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

  return {
    ok: true,
    body: {
      stages: board.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, key: s.key })),
      leads,
      timezone: tenant.zone,
    },
  };
}
