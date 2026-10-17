import type { Env, ApiData } from "../../lib/env";
import type { AutoChatBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { ItemInputError, createAutoChat } from "../../lib/agentItems";

// POST /api/agent-runner/auto-chat  body AutoChatBody -> { chatId }
//
// A startup check found something for one agent at one client: open an Auto
// chat for it with the reason already queued, so the next claim answers it.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: AutoChatBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  try {
    return Response.json({ chatId: await createAutoChat(client, body) });
  } catch (err) {
    if (err instanceof ItemInputError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
};
