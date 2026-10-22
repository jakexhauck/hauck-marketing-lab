import type { Env, ApiData } from "../../lib/env";
import type { ItemBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { ItemInputError, upsertItem } from "../../lib/agentItems";
import { notifyItem } from "../../lib/telegramManager";

// POST /api/agent-runner/item  body ItemBody -> AgentItem
//
// A Building card from an agent, new (no id) or rewritten (id). With
// fromAgent it is a request to another agent and also lands as a Request
// message in that agent's chat. Jake's Approve / Change it / Decline is the
// admin PATCH (api/admin/agents/items/[itemId].ts), never this route.
//
// A card (or request) left waiting on Jake also goes to him on Telegram, after
// the response: a new card, or a rewrite that changed what Approve would do.
// An unchanged rewrite sends nothing. See lib/telegramManager.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: ItemBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  try {
    const item = await upsertItem(client, body);
    ctx.waitUntil(
      notifyItem(ctx.env, client, item).catch((err) => console.error("[telegram] notify failed:", (err as Error).message)),
    );
    return Response.json(item);
  } catch (err) {
    if (err instanceof ItemInputError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
};
