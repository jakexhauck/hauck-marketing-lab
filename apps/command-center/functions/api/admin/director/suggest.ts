import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { suggestTask } from "../../../lib/director";
import { isAgentId } from "../../../../src/lib/agents";

// POST /api/admin/director/suggest  body { agent, text }
//   -> 200 { suggestion: { stageId, name, owner, steps } }
//
// The Tell bar: Jake's sentence, Claude's task. Nothing is saved; the page
// shows it as a New card and Add saves it (POST tasks, with these steps).
// Owner only.

const TEXT_MAX = 1000;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: { agent?: unknown; text?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (typeof body.agent !== "string" || !isAgentId(body.agent) || !text || text.length > TEXT_MAX) {
    return Response.json({ error: "agent and text required" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await suggestTask(client, ctx.env, body.agent, text);
  if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
  return Response.json({ suggestion: res.suggestion });
};
