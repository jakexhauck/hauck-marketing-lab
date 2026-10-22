import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { isAgentId } from "../../../../src/lib/agents";
import { queueJobCommand, readAgentOps } from "../../../lib/agentOps";

// GET  /api/admin/agents/ops?agent=ads  -> AgentOpsView (the Settings tab)
// POST /api/admin/agents/ops  body { agent, jobId, action } -> { id }
//
// Jake's pause, resume or run of a scheduled job is queued; the runner carries
// it out on its next post (at most ten minutes). Owner only, checked here.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const agent = new URL(ctx.request.url).searchParams.get("agent");
  if (!isAgentId(agent)) return Response.json({ error: "unknown agent" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json(await readAgentOps(client, agent), { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = (await ctx.request.json().catch(() => null)) as { agent?: string; jobId?: string; action?: string } | null;
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await queueJobCommand(client, body?.agent ?? "", body?.jobId ?? "", body?.action ?? "");
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  await logAdminAction(client, admin.id, `agent_job.${body!.action}`, null, { agent: body!.agent, jobId: body!.jobId });
  return Response.json(res);
};
