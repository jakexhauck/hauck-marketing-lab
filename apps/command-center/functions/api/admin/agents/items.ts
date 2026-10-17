import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isAgentId } from "../../../../src/lib/agents";
import { listItems, parseTenantParam } from "../../../lib/agentItems";

// GET /api/admin/agents/items?tenant=<uuid|agency>&agent=<id> -> { items: AgentItem[] }
//
// Building cards, newest first. agent is optional: without it, every agent at
// that tenant, which is what the rail's needs_ok badges count from. Owner
// only, checked here.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(ctx.request.url);
  const tenantId = parseTenantParam(url.searchParams.get("tenant"));
  const agent = url.searchParams.get("agent");
  if (tenantId === undefined) return Response.json({ error: "tenant required" }, { status: 400 });
  if (agent !== null && agent !== "" && !isAgentId(agent)) {
    return Response.json({ error: "unknown agent" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const items = await listItems(client, tenantId, isAgentId(agent) ? agent : null);
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
};
