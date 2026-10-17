import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { decideItem, isUuid, type ItemAction } from "../../../../lib/agentItems";

// PATCH /api/admin/agents/items/:itemId  body { action: "approve" | "decline" | "change", note? }
//   -> { item: AgentItem }
//
// Jake's Approve / Change it / Decline on a card. The rules are
// transitionItem in lib/agentItems.ts; a second click on a card already
// decided is a 409 and sends the agent nothing. Owner only, checked here.

const ACTIONS: ItemAction[] = ["approve", "decline", "change"];

export const onRequestPatch: PagesFunction<Env, "itemId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const itemId = ctx.params.itemId as string;
  if (!isUuid(itemId)) return Response.json({ error: "item not found" }, { status: 404 });
  let body: { action?: string; note?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const action = body.action as ItemAction;
  if (!ACTIONS.includes(action)) return Response.json({ error: "unknown action" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
  if (action === "change" && !note) return Response.json({ error: "note required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await decideItem(client, itemId, action, note);
  if ("error" in res) {
    return Response.json({ error: res.error === 404 ? "item not found" : "already decided" }, { status: res.error });
  }
  await logAdminAction(client, admin.id, `agent_item.${action}`, res.item.tenantId, { itemId });
  return Response.json(res);
};
