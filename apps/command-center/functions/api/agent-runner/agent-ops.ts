import type { Env, ApiData } from "../../lib/env";
import type { AgentOpsBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { saveAgentOps } from "../../lib/agentOps";

// POST /api/agent-runner/agent-ops  body AgentOpsBody -> AgentOpsResponse
//
// The VPS runner's ten-minute read of every Hermes agent (health, usage, jobs,
// skills), and the job commands Jake queued since, in the answer.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: AgentOpsBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await saveAgentOps(client, body);
  if ("error" in res) return Response.json({ error: "agents required" }, { status: 400 });
  return Response.json(res);
};
