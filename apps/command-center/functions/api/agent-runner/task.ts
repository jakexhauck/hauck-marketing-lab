import type { Env, ApiData } from "../../lib/env";
import type { RunnerTaskBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { agentTaskUpdate } from "../../lib/agentTasks";

// POST /api/agent-runner/task  body { messageId, updates: [{ key, state, evidence?, note? }] }
//   -> 200 { updated, refused }
//
// An agent moves its own client tasks forward (lib/agentTasks.ts). The agent
// and client come from the claimed message on the server, never the request.
// Behind the runner gate in api/_middleware.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: RunnerTaskBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await agentTaskUpdate(client, body);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json(res);
};
