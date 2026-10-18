import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { createStage } from "../../../lib/director";
import { isAgentId } from "../../../../src/lib/agents";

// POST /api/admin/director/stages  body { agent, name } -> 200 { stage }
//
// A new column at the end of one agent's board. Owner only.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: { agent?: unknown; name?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof body.agent !== "string" || !isAgentId(body.agent)) return Response.json({ error: "agent required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await createStage(client, body.agent, body.name);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json({ stage: res.ok });
};
