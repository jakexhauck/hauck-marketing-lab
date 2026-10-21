import type { Env, ApiData } from "../../lib/env";
import { tenantTimezone } from "../../lib/env";
import type { GhlContext } from "../../lib/ghl";
import { getServiceClient } from "../../lib/supabase";
import { readBoard } from "../../lib/boardRead";

// GET /api/pipeline-board (owner endpoint): the Leads board.
//
// Stages come live from the client's GHL "Sales Pipeline" (found by its stage
// names, see lib/leadBoard.ts), in GHL's order and colours. Each lead is an
// opportunity on it, joined to what the app holds: the scheduled booking, the
// open follow-up, the lost reason and call attempts (0150).
//
// No board pipeline => { configError: "pipeline_not_found" }, and the Leads
// page keeps the old board. That is how Willis and Made Better stay put.

export type { BoardLead } from "../../lib/boardRead";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const read = await readBoard(client, gctx, t.slug, tenantTimezone(ctx.env));
  return Response.json(read.body, read.ok ? undefined : { status: read.status });
};
