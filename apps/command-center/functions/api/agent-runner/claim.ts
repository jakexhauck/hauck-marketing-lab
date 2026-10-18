import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { claimNext } from "../../lib/agentRunner";
import { withBrief } from "../../lib/clientBriefs";
import { withSop } from "../../lib/director";

// POST /api/agent-runner/claim  body { host } -> ClaimResponse | null
//
// The PC runner's poll. Puts this host's dead runs back first, then claims the
// oldest queued message with the status-filtered update as the lock. See
// lib/agentRunner.ts. The client's whole brief rides along
// (lib/clientBriefs.ts), and so does the agent's own SOP from the Director
// (lib/director.ts). Behind the runner gate in api/_middleware.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: { host?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const host = typeof body.host === "string" ? body.host.trim().slice(0, 100) : "";
  if (!host) return Response.json({ error: "host required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json(await withSop(client, await withBrief(client, await claimNext(client, host))));
};
