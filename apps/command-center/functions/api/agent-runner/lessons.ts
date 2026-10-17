import type { Env, ApiData } from "../../lib/env";
import type { LessonsBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { replaceLessons } from "../../lib/agentRunner";

// POST /api/agent-runner/lessons  body LessonsBody -> { ok: true, saved }
//
// The runner re-read some brain files from the vault: replace the app's mirror
// of exactly those files, and mark the queued edits it applied. The vault is
// the truth; this table is only what the Brain tab can read.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: LessonsBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await replaceLessons(client, body);
  if ("error" in res) return Response.json({ error: "bad scope" }, { status: 400 });
  return Response.json(res);
};
