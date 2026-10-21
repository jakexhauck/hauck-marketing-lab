import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentItem, FileAssetBody } from "../../src/lib/agentWire";
import { grantFrom, isUuid, itemFromRow } from "./agentItems";
import { messageFromRow } from "./agentRunner";

// POST /api/agent-runner/file-asset: a landing page Jake approved is live, so
// mark its card live with the live URL (docs/build-plans/agents.md, Phase 2).
// Until 2026-10-20 it was also filed into Conversion Assets, which are gone
// (docs/build-plans/four-agents-and-handoffs.md); the route keeps its name.
//
// The runner holds a secret, not Jake's session, so nothing it says is taken
// on trust. Every fact this needs is read back from the database:
//
//   - the message is a `me` message that is running right now,
//   - its chat is the Ads Agent's (which builds the pages), at the client named,
//   - it carries a deploy grant, which only an Approve click puts there
//     (decideItem), and the card that grant names is that agent's, at that
//     client, in that chat, approved, and asked for a deploy itself,
//   - the live URL is the approved preview's own Pages project.
//
// So a stolen runner secret can, at worst, re-mark a page Jake already
// approved at the address it was approved for.

type Row = Record<string, unknown>;

export type FileAssetResult = { itemId: string; liveUrl: string; item: AgentItem } | { error: 400 | 403 | 404 | 409; reason: string };

const no = (error: 400 | 403 | 404 | 409, reason: string) => ({ error, reason });

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/**
 * The live URL is https://<project>.pages.dev and the approved preview was
 * https://<branch>.<project>.pages.dev. Anything else is refused.
 */
export function liveUrlMatches(previewUrl: unknown, liveUrl: unknown): boolean {
  if (typeof previewUrl !== "string" || typeof liveUrl !== "string") return false;
  const p = previewUrl.match(/^https:\/\/[a-z0-9-]+\.([a-z0-9-]+)\.pages\.dev\/?$/i);
  const l = liveUrl.match(/^https:\/\/([a-z0-9-]+)\.pages\.dev\/?$/i);
  return !!p && !!l && p[1].toLowerCase() === l[1].toLowerCase();
}

export async function markPageLive(client: SupabaseClient, body: FileAssetBody): Promise<FileAssetResult> {
  if (!isUuid(body?.messageId) || !isUuid(body?.tenantId) || typeof body.liveUrl !== "string") {
    return no(400, "messageId, tenantId and liveUrl are required");
  }

  const { data: msgRow, error: mErr } = await client.from("agent_messages").select("*").eq("id", body.messageId).maybeSingle();
  fail("message", mErr);
  if (!msgRow || (msgRow as Row).role !== "me") return no(404, "message not found");
  const message = messageFromRow(msgRow as Row);
  if (message.status !== "running") return no(409, "message is not running");

  const { data: chat, error: cErr } = await client
    .from("agent_chats")
    .select("id, agent, tenant_id")
    .eq("id", message.chatId)
    .maybeSingle();
  fail("chat", cErr);
  if (!chat || (chat as Row).agent !== "ads") return no(403, "not an Ads Agent chat");
  if ((chat as Row).tenant_id !== body.tenantId) return no(403, "chat is for another client");

  const grant = message.grant;
  if (!grant || grant.kind !== "deploy") return no(409, "no deploy grant on this message");

  const { data: itemRow, error: iErr } = await client.from("agent_items").select("*").eq("id", grant.itemId).maybeSingle();
  fail("item", iErr);
  if (!itemRow) return no(409, "the granted card is gone");
  const item = itemFromRow(itemRow as Row);
  if (item.agent !== "ads" || item.tenantId !== body.tenantId || item.chatId !== message.chatId) {
    return no(403, "the granted card belongs elsewhere");
  }
  // done is what Approve leaves; live is a re-run of this same call.
  if (!["done", "live"].includes(item.status) || !item.approvedAt) return no(409, "the card was not approved");
  if (grantFrom(item)?.kind !== "deploy") return no(409, "the card did not ask for a deploy");
  if (!liveUrlMatches(item.payload.previewUrl, body.liveUrl)) return no(400, "liveUrl is not the approved preview's project");

  const liveUrl = body.liveUrl.replace(/\/$/, "");

  const { data: moved, error: uErr } = await client
    .from("agent_items")
    .update({ status: "live", payload: { ...item.payload, liveUrl } })
    .eq("id", item.id)
    .in("status", ["done", "live"])
    .select("*");
  fail("item live", uErr);
  const after = ((moved ?? []) as Row[])[0];
  return { itemId: item.id, liveUrl, item: after ? itemFromRow(after) : item };
}
