import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { claimNext } from "../../lib/agentRunner";
import { isAgentId, type AgentId } from "../../../src/lib/agents";
import { withBrief } from "../../lib/clientBriefs";
import { withSop } from "../../lib/agentSop";
import { withTasks } from "../../lib/agentTasks";

// POST /api/agent-runner/claim  body { host, agents? } -> ClaimResponse | null
//
// The PC runner's poll. Puts this host's dead runs back first, then claims the
// oldest queued message with the status-filtered update as the lock. See
// lib/agentRunner.ts. The client's whole brief rides along
// (lib/clientBriefs.ts), and so does the agent's own SOP from its map on the
// SOPs tab (lib/agentSop.ts), and the client's tasks from its Director
// (lib/agentTasks.ts). Behind the runner gate in api/_middleware.ts.
// agents, when sent, is the list of agents this runner answers (the VPS runs
// the Hermes agents, the PC the rest); a name the app does not know is a 400,
// not a silently empty claim.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: { host?: unknown; agents?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const host = typeof body.host === "string" ? body.host.trim().slice(0, 100) : "";
  if (!host) return Response.json({ error: "host required" }, { status: 400 });
  let agents: AgentId[] | undefined;
  if (body.agents !== undefined) {
    if (!Array.isArray(body.agents) || !body.agents.every((a) => typeof a === "string" && isAgentId(a))) {
      return Response.json({ error: "agents must be a list of agent ids" }, { status: 400 });
    }
    agents = body.agents as AgentId[];
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json(withSop(await withTasks(client, await withBrief(client, await claimNext(client, host, new Date(), agents)))));
};
