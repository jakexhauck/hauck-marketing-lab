import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { chatMessages, isUuid, queueMessage } from "../../../../lib/agentItems";

// GET  /api/admin/agents/chats/:chatId               -> { messages: AgentMessage[] } oldest first
// POST /api/admin/agents/chats/:chatId  body { body } -> AgentMessage (queued)
//
// One chat, and Jake sending into it. A sent message is stored as `queued`
// whether or not the PC is on; the runner claims it whenever it next polls.
// Owner only, checked here.

const MAX_BODY = 20000;

export const onRequestGet: PagesFunction<Env, "chatId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const chatId = ctx.params.chatId as string;
  if (!isUuid(chatId)) return Response.json({ error: "chat not found" }, { status: 404 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json({ messages: await chatMessages(client, chatId) }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPost: PagesFunction<Env, "chatId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const chatId = ctx.params.chatId as string;
  if (!isUuid(chatId)) return Response.json({ error: "chat not found" }, { status: 404 });
  let body: { body?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return Response.json({ error: "message required" }, { status: 400 });
  if (text.length > MAX_BODY) return Response.json({ error: "message too long" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { data: chat } = await client.from("agent_chats").select("id").eq("id", chatId).maybeSingle();
  if (!chat) return Response.json({ error: "chat not found" }, { status: 404 });
  return Response.json(await queueMessage(client, chatId, text));
};
