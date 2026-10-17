import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { runnerStatus } from "../../../lib/agentItems";

// GET /api/admin/agents/status -> RunnerStatus
//
// Is the PC runner alive? Online while the newest heartbeat from any host is
// under 90 seconds old (lib/agentItems.ts). Owner only, checked here.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ online: false, lastSeenAt: null });
  const { data, error } = await client.from("agent_runner_state").select("last_seen_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(runnerStatus((data ?? []) as { last_seen_at: string | null }[], new Date()), {
    headers: { "Cache-Control": "no-store" },
  });
};
