import type { SupabaseClient } from "@supabase/supabase-js";
import { isAgentId, type AgentId } from "../../src/lib/agents";
import type { BriefAuthor, BriefDrive, BriefSection, ClaimResponse, RunnerBriefBody } from "../../src/lib/agentWire";
import { fullBrief, isBriefAuthor, MAX_SECTION_CHARS } from "../../src/lib/clientBrief";
import { isUuid } from "./agentItems";
import { messageFromRow, stripEmDash, type ClaimCore } from "./agentRunner";

// The Client Brief's store (migration 0168; docs/build-plans/agents.md, Phase 6).
//
// One row per (client, section). version is the lock: a save names the version
// it read, and only a save naming the current one goes through, bumped by one.
// Anything else is a conflict, answered with the current section, so Jake's
// edit is never overwritten by an agent working from an older copy (and the
// other way round).
//
// The update itself carries the version filter, the same status-filtered PATCH
// the claim uses as its lock: two saves racing on version 3 both send
// "where version = 3", one matches, the other matches nothing and is told.

type Row = Record<string, unknown>;

export type SaveResult = { saved: BriefSection } | { conflict: BriefSection } | { error: 400; reason: string };

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function sectionFromRow(r: Row): BriefSection {
  return {
    section: r.section as AgentId,
    body: (r.body as string) ?? "",
    version: Number(r.version) || 0,
    updatedBy: isBriefAuthor(r.updated_by) ? r.updated_by : null,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

const unwritten = (section: AgentId): BriefSection => ({ section, body: "", version: 0, updatedBy: null, updatedAt: null });

export async function readBrief(client: SupabaseClient, tenantId: string): Promise<BriefSection[]> {
  const { data, error } = await client.from("client_briefs").select("*").eq("tenant_id", tenantId);
  fail("brief", error);
  return fullBrief(((data ?? []) as Row[]).filter((r) => isAgentId(r.section as string)).map(sectionFromRow));
}

async function currentSection(client: SupabaseClient, tenantId: string, section: AgentId): Promise<BriefSection> {
  const { data, error } = await client
    .from("client_briefs")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("section", section)
    .maybeSingle();
  fail("brief section", error);
  return data ? sectionFromRow(data as Row) : unwritten(section);
}

export interface SaveInput {
  tenantId: string;
  section: AgentId;
  body: string;
  version: number;
  by: BriefAuthor;
}

export async function saveBriefSection(client: SupabaseClient, input: SaveInput, now: Date = new Date()): Promise<SaveResult> {
  const { tenantId, section, body, version, by } = input;
  if (!isUuid(tenantId)) return { error: 400, reason: "tenant required" };
  if (!isAgentId(section)) return { error: 400, reason: "unknown section" };
  if (!Number.isInteger(version) || version < 0) return { error: 400, reason: "version must be a whole number" };
  if (typeof body !== "string" || body.length > MAX_SECTION_CHARS) return { error: 400, reason: "body too long" };
  if (!isBriefAuthor(by)) return { error: 400, reason: "unknown author" };

  const stamp = now.toISOString();
  if (version === 0) {
    const current = await currentSection(client, tenantId, section);
    if (current.version > 0) return { conflict: current };
    const { data, error } = await client
      .from("client_briefs")
      .insert({ tenant_id: tenantId, section, body, version: 1, updated_by: by, updated_at: stamp })
      .select("*")
      .maybeSingle();
    // Two first saves at once: the primary key lets one in. The other is a
    // conflict like any stale write.
    if (error && (error as { code?: string }).code === "23505") return { conflict: await currentSection(client, tenantId, section) };
    fail("brief insert", error);
    return { saved: sectionFromRow(data as Row) };
  }

  const { data, error } = await client
    .from("client_briefs")
    .update({ body, version: version + 1, updated_by: by, updated_at: stamp })
    .eq("tenant_id", tenantId)
    .eq("section", section)
    .eq("version", version)
    .select("*");
  fail("brief update", error);
  const hit = ((data ?? []) as Row[])[0];
  if (hit) return { saved: sectionFromRow(hit) };
  return { conflict: await currentSection(client, tenantId, section) };
}

export type AgentSaveResult =
  | { tenantId: string; saved: BriefSection }
  | { tenantId: string; conflict: BriefSection }
  | { error: 400 | 403 | 404 | 409; reason: string };

/**
 * An agent rewrites its own section.
 *
 * The runner holds a secret, not Jake's session, so the section is never taken
 * from the request: it is the agent whose chat the claimed message is in, read
 * back from the database. A message that is not a running `me` message has no
 * turn behind it and is refused. The agency Manager has no client and so no
 * brief.
 */
export async function agentSaveBrief(client: SupabaseClient, body: RunnerBriefBody, now: Date = new Date()): Promise<AgentSaveResult> {
  if (!isUuid(body?.messageId) || typeof body.body !== "string" || typeof body.version !== "number") {
    return { error: 400, reason: "messageId, body and version are required" };
  }
  const { data: msgRow, error: mErr } = await client.from("agent_messages").select("*").eq("id", body.messageId).maybeSingle();
  fail("message", mErr);
  if (!msgRow || (msgRow as Row).role !== "me") return { error: 404, reason: "message not found" };
  const message = messageFromRow(msgRow as Row);
  if (message.status !== "running") return { error: 409, reason: "message is not running" };

  const { data: chat, error: cErr } = await client
    .from("agent_chats")
    .select("id, agent, tenant_id")
    .eq("id", message.chatId)
    .maybeSingle();
  fail("chat", cErr);
  if (!chat) return { error: 404, reason: "chat not found" };
  const agent = (chat as Row).agent as string;
  const tenantId = (chat as Row).tenant_id as string | null;
  if (!tenantId) return { error: 403, reason: "the agency has no brief" };
  if (!isAgentId(agent)) return { error: 403, reason: "unknown agent" };

  const res = await saveBriefSection(
    client,
    { tenantId, section: agent, body: stripEmDash(body.body).trim(), version: body.version, by: agent },
    now,
  );
  if ("error" in res) return res;
  return { tenantId, ...res };
}

export async function readBriefDrive(client: SupabaseClient, tenantId: string): Promise<BriefDrive | null> {
  const { data, error } = await client.from("client_brief_drive").select("*").eq("tenant_id", tenantId).maybeSingle();
  fail("brief drive", error);
  if (!data) return null;
  const r = data as Row;
  return {
    docUrl: (r.doc_url as string | null) ?? null,
    syncedAt: (r.synced_at as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    revision: Number(r.revision) || 0,
  };
}

/** The claim as the runner gets it: the client's whole brief rides along. */
export async function withBrief(client: SupabaseClient, claim: ClaimCore | null): Promise<ClaimResponse | null> {
  if (!claim) return null;
  return { ...claim, brief: claim.tenant ? await readBrief(client, claim.tenant.id) : [] };
}
