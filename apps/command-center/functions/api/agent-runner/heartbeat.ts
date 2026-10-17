import type { Env, ApiData } from "../../lib/env";
import type { HeartbeatBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { heartbeat } from "../../lib/agentRunner";

// POST /api/agent-runner/heartbeat  body { host, monitored? } -> HeartbeatResponse
//
// The rail footer's online/offline is read from these (api/admin/agents/status).
// The answer carries when the startup check last ran and the lesson edits
// waiting for the runner to apply to the vault.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: HeartbeatBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const host = typeof body.host === "string" ? body.host.trim().slice(0, 100) : "";
  if (!host) return Response.json({ error: "host required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json(await heartbeat(client, { host, monitored: body.monitored === true }));
};
