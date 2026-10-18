import type { Env, ApiData } from "../../lib/env";
import type { AnswerBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { postAnswer } from "../../lib/agentItems";

// POST /api/agent-runner/answer  body { messageId, body }
//   -> 200 { posted }
//
// An agent's reply to an approved request, queued in the asking agent's chat
// (lib/agentItems.ts postAnswer). Who asked and from which chat are read from
// the request card the claimed message follows up, never from the request.
// Behind the runner gate in api/_middleware.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: AnswerBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await postAnswer(client, body);
  if ("error" in res) {
    return Response.json({ error: res.error === 404 ? "no approved request to answer" : "bad answer" }, { status: res.error });
  }
  return Response.json(res);
};
