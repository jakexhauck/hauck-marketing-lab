import type { Env, ApiData } from "../../lib/env";
import type { RunnerPageBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { agentSavePage } from "../../lib/briefPagesStore";
import { composioBriefOps, syncBriefToDrive } from "../../lib/briefDrive";

// POST /api/agent-runner/brief-page  body RunnerPageBody
//   -> 200 { page }, or 409 { page } with the current one when the version is
//      stale. 403 for an agent with no page (only research and ads have one).
//
// An agent rewrites its own Mission Control page (lib/briefPagesStore.ts). The
// page is the claimed message's chat agent, read on the server.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: RunnerPageBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await agentSavePage(client, body);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  if ("conflict" in res) return Response.json({ page: res.conflict }, { status: 409 });
  ctx.waitUntil(syncBriefToDrive(client, res.tenantId, composioBriefOps(ctx.env)));
  return Response.json({ page: res.saved });
};
