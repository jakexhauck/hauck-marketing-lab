import type { Env, ApiData } from "../../lib/env";
import type { RunnerTickBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { agentTick } from "../../lib/briefTicks";

// POST /api/agent-runner/tick  body { messageId, labels }
//   -> 200 { ticked, refused }
//
// An agent ticks finished boxes in its own Client Brief section (lib/briefTicks.ts).
// Which sections it may tick is read from the claimed message's chat on the
// server, never from the request. Behind the runner gate in api/_middleware.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: RunnerTickBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await agentTick(client, body);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json({ ticked: res.ticked, refused: res.refused });
};
