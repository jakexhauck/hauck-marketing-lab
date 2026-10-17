import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentItem, AgentMessage, Grant } from "../../src/lib/agentWire";
import { isUuid, itemFromRow } from "./agentItems";
import { messageFromRow } from "./agentRunner";
import { AD_CREATIVES_BUCKET, pathBelongsTo } from "./adCreativeFiles";

// The Creative Agent's server-side checks (docs/build-plans/agents.md,
// "Cross-lane rule: enforcement lives in code", and Phase 3).
//
// The runner secret alone buys nothing here. Every call names the message the
// runner claimed, and the app checks it against its own rows:
//
//   upload-url, read-url   the message is running, in a Creative chat for
//                          that very client
//   file-creative          all of that, and the message carries a file grant
//                          whose card is a Creative card in the same chat,
//                          approved by Jake, asking for a file grant, for
//                          exactly the path being filed
//
// So a stolen secret, or an agent that talked the runner into something, can
// at most upload into one client's previews while a Creative turn is running.
// Filing into the client's Creatives (which the client sees) takes Jake's
// click on the card that shows that file.

type Row = Record<string, unknown>;

export type Refusal = { status: 400 | 403 | 404 | 409; error: string };

export interface CreativeTurn {
  message: AgentMessage;
  chatId: string;
  tenantId: string;
}

/** Is this message a running turn of the Creative Agent at this client? */
export async function creativeTurn(
  client: SupabaseClient,
  messageId: unknown,
  tenantId: unknown,
): Promise<CreativeTurn | Refusal> {
  if (!isUuid(messageId) || !isUuid(tenantId)) return { status: 400, error: "messageId and tenantId required" };
  const { data: m, error } = await client.from("agent_messages").select("*").eq("id", messageId).maybeSingle();
  if (error) throw new Error(`message: ${error.message}`);
  if (!m) return { status: 404, error: "message not found" };
  const message = messageFromRow(m as Row);
  if (message.role !== "me" || message.status !== "running") return { status: 409, error: "message is not running" };
  const { data: c, error: cErr } = await client
    .from("agent_chats")
    .select("id, tenant_id, agent")
    .eq("id", message.chatId)
    .maybeSingle();
  if (cErr) throw new Error(`chat: ${cErr.message}`);
  const chat = c as Row | null;
  if (!chat || chat.agent !== "creative" || chat.tenant_id !== tenantId) {
    return { status: 403, error: "not a Creative chat for this client" };
  }
  return { message, chatId: chat.id as string, tenantId };
}

/**
 * May this turn file `path` into Creatives? Pure: the rows are read by
 * fileGrantFor. Each refusal says which rule it failed, for the runner's log.
 */
export function checkFileGrant(turn: CreativeTurn, item: AgentItem | null, path: string): Refusal | null {
  const g: Grant | null = turn.message.grant;
  if (!g || g.kind !== "file") return { status: 409, error: "no file grant on this message" };
  if (!item || item.id !== g.itemId) return { status: 409, error: "the granted card is gone" };
  if (item.agent !== "creative" || item.tenantId !== turn.tenantId || item.chatId !== turn.chatId) {
    return { status: 403, error: "the granted card belongs elsewhere" };
  }
  if (item.status !== "done" || !item.approvedAt) return { status: 409, error: "the card was not approved" };
  const asked = item.payload.grant as Row | undefined;
  if (!asked || asked.kind !== "file") return { status: 409, error: "the card did not ask to file anything" };
  if (item.payload.runnerOwned !== true) return { status: 409, error: "the runner did not make that card" };
  if (item.payload.path !== path || !pathBelongsTo(path, turn.tenantId)) {
    return { status: 409, error: "that is not the file on the approved card" };
  }
  return null;
}

export async function fileGrantFor(client: SupabaseClient, turn: CreativeTurn, path: unknown): Promise<Refusal | null> {
  if (typeof path !== "string" || !path) return { status: 400, error: "path required" };
  const itemId = turn.message.grant?.itemId;
  let item: AgentItem | null = null;
  if (itemId && isUuid(itemId)) {
    const { data, error } = await client.from("agent_items").select("*").eq("id", itemId).maybeSingle();
    if (error) throw new Error(`item: ${error.message}`);
    item = data ? itemFromRow(data as Row) : null;
  }
  const refused = checkFileGrant(turn, item, path);
  if (refused) return refused;
  // One Approve files one file once: a replayed call must not add a second tile.
  const { data: dupe, error: dErr } = await client.from("ad_creative_files").select("id").eq("path", path).limit(1);
  if (dErr) throw new Error(`creative files: ${dErr.message}`);
  if ((dupe ?? []).length) return { status: 409, error: "already filed" };
  return null;
}

// Previews live beside a client's creatives, under previews/, where nothing
// lists them and pathBelongsTo (the filing rule) never matches.
export const PREVIEW_DIR = "previews";
const PREVIEW_DAYS = 7;

export function previewPath(tenantId: string, ext: string): string {
  return `${tenantId}/${PREVIEW_DIR}/${crypto.randomUUID()}.${ext}`;
}

/** A path this client's runner may read back: a preview or a final of its own. */
export function readablePath(path: unknown, tenantId: string): path is string {
  if (typeof path !== "string") return false;
  if (pathBelongsTo(path, tenantId)) return true;
  const m = /^([0-9a-f-]{36})\/previews\/[0-9a-f-]{36}\.(mp4|jpg|png|webp)$/i.exec(path);
  return Boolean(m) && m![1].toLowerCase() === tenantId.toLowerCase();
}

/** Old previews to prune, from a storage listing of <tenant>/previews. */
export function stalePreviews(objects: { name: string; created_at?: string | null }[], now: Date): string[] {
  const cutoff = now.getTime() - PREVIEW_DAYS * 86_400_000;
  return objects.filter((o) => o.created_at && Date.parse(o.created_at) < cutoff).map((o) => o.name);
}

export async function prunePreviews(client: SupabaseClient, tenantId: string, now = new Date()): Promise<void> {
  const dir = `${tenantId}/${PREVIEW_DIR}`;
  const { data } = await client.storage.from(AD_CREATIVES_BUCKET).list(dir, { limit: 1000 });
  const stale = stalePreviews((data ?? []) as { name: string; created_at?: string | null }[], now);
  if (stale.length) await client.storage.from(AD_CREATIVES_BUCKET).remove(stale.map((n) => `${dir}/${n}`));
}
