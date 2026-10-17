import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { isUuid } from "../../lib/agentItems";
import { buildSnapshot } from "../../lib/agentSnapshot";

// GET /api/agent-runner/snapshot?tenant=<uuid> -> Snapshot
//
// One client's numbers for the startup check. Reads only: Meta insights, the
// client's GHL pipeline and calendars, and the app's own checklist rows. See
// lib/agentSnapshot.ts for where each figure comes from.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenant");
  if (!isUuid(tenantId)) return Response.json({ error: "tenant required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const snap = await buildSnapshot(ctx.env, client, tenantId, url.origin);
  if (!snap) return Response.json({ error: "client not found" }, { status: 404 });
  return Response.json(snap);
};
