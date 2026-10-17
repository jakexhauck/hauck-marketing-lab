import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isAgentId } from "../../../../src/lib/agents";
import { chatSummaries, chatSummaryFromRow, createChat, parseTenantParam } from "../../../lib/agentItems";

// GET  /api/admin/agents/chats?tenant=<uuid|agency>&agent=<id> -> ChatSummary[]
// POST /api/admin/agents/chats  body { tenant, agent }          -> ChatSummary
//
// An agent page's chat list, and New chat. tenant=agency is the Manager on
// the agency rail (tenant_id null), which sees only its own chats, never a
// client's. Owner only, checked here.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(ctx.request.url);
  const tenantId = parseTenantParam(url.searchParams.get("tenant"));
  const agent = url.searchParams.get("agent");
  if (tenantId === undefined || !isAgentId(agent)) {
    return Response.json({ error: "tenant and agent required" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json(await chatSummaries(client, tenantId, agent), { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: { tenant?: string; agent?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const tenantId = parseTenantParam(body.tenant);
  if (tenantId === undefined || !isAgentId(body.agent)) {
    return Response.json({ error: "tenant and agent required" }, { status: 400 });
  }
  // The agency rail carries the Manager and nobody else.
  if (tenantId === null && body.agent !== "manager") {
    return Response.json({ error: "only the Manager works at the agency" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const row = await createChat(client, { tenantId, agent: body.agent, userId: admin.id });
  return Response.json(chatSummaryFromRow(row));
};
