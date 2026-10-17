import type { SupabaseClient } from "@supabase/supabase-js";
import { isAgentId, type AgentId } from "../../src/lib/agents";
import type { BriefAuthor, BriefDrive, BriefSection, BriefSectionId, ClaimResponse, RunnerBriefBody } from "../../src/lib/agentWire";
import { fullBrief, isBriefAuthor, isBriefSectionId, MAX_SECTION_CHARS } from "../../src/lib/clientBrief";
import { clientSeed } from "../../src/lib/briefClientSeed";
import { claimBoxes } from "../../src/lib/briefChecklist";
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
    section: r.section as BriefSectionId,
    body: (r.body as string) ?? "",
    version: Number(r.version) || 0,
    updatedBy: isBriefAuthor(r.updated_by) ? r.updated_by : null,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

const unwritten = (section: BriefSectionId): BriefSection => ({ section, body: "", version: 0, updatedBy: null, updatedAt: null });

export async function readBrief(client: SupabaseClient, tenantId: string): Promise<BriefSection[]> {
  const { data, error } = await client.from("client_briefs").select("*").eq("tenant_id", tenantId);
  fail("brief", error);
  return fullBrief(((data ?? []) as Row[]).filter((r) => isBriefSectionId(r.section)).map(sectionFromRow));
}

async function currentSection(client: SupabaseClient, tenantId: string, section: BriefSectionId): Promise<BriefSection> {
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
  section: BriefSectionId;
  body: string;
  version: number;
  by: BriefAuthor;
}

export async function saveBriefSection(client: SupabaseClient, input: SaveInput, now: Date = new Date()): Promise<SaveResult> {
  const { tenantId, section, body, version, by } = input;
  if (!isUuid(tenantId)) return { error: 400, reason: "tenant required" };
  if (!isBriefSectionId(section)) return { error: 400, reason: "unknown section" };
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

export type TurnChat = { agent: AgentId; tenantId: string } | { error: 400 | 403 | 404 | 409; reason: string };

/**
 * The agent and client behind a runner write, read from the database: the
 * claimed message must be a running `me` message, and its chat's agent is the
 * writer. The runner holds a secret, not Jake's session, so nothing about who
 * is writing is ever taken from the request. The agency has no brief.
 */
export async function turnChat(client: SupabaseClient, messageId: unknown): Promise<TurnChat> {
  if (!isUuid(messageId)) return { error: 400, reason: "messageId required" };
  const { data: msgRow, error: mErr } = await client.from("agent_messages").select("*").eq("id", messageId).maybeSingle();
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
  return { agent, tenantId };
}

/**
 * An agent rewrites its own section: the section is the agent of the claimed
 * message's chat (turnChat), so a request has no way to aim at another. The
 * three sections no agent owns (Client and the two calls) are out of reach.
 */
export async function agentSaveBrief(client: SupabaseClient, body: RunnerBriefBody, now: Date = new Date()): Promise<AgentSaveResult> {
  if (!isUuid(body?.messageId) || typeof body.body !== "string" || typeof body.version !== "number") {
    return { error: 400, reason: "messageId, body and version are required" };
  }
  const who = await turnChat(client, body.messageId);
  if ("error" in who) return who;
  const { agent, tenantId } = who;

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

/**
 * Brief v2: the Client section starts as the onboarding form's answers. While
 * it is unwritten (version 0) and the client filled the form in, it is written
 * once from them, as Jake's (it is his to edit from then on). A secret's value
 * never goes in (briefClientSeed.ts); the password is only ever "on file".
 *
 * Returns the brief with the seeded section in place, and whether it wrote, so
 * the caller can sync Drive. A save that loses the race to another seed or an
 * edit is fine: the section is written either way, so it is read back.
 */
export async function seedClientSection(
  client: SupabaseClient,
  tenantId: string,
  sections: BriefSection[],
  now: Date = new Date(),
): Promise<{ sections: BriefSection[]; seeded: boolean }> {
  const current = sections.find((s) => s.section === "client");
  if (!current || current.version > 0) return { sections, seeded: false };
  const { data: row, error } = await client.from("onboarding").select("intake").eq("tenant_id", tenantId).maybeSingle();
  fail("onboarding", error);
  const intake = ((row as Row | null)?.intake ?? {}) as Record<string, unknown>;
  const { data: sub } = await client
    .from("intake_submissions")
    .select("password_plain")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const hasPassword = Boolean(((sub as Row | null)?.password_plain as string | null)?.trim());
  const body = clientSeed(intake, { hasPassword });
  if (!body) return { sections, seeded: false };
  const res = await saveBriefSection(client, { tenantId, section: "client", body, version: 0, by: "jake" }, now);
  const next = "saved" in res ? res.saved : "conflict" in res ? res.conflict : null;
  if (!next) return { sections, seeded: false };
  return { sections: sections.map((s) => (s.section === "client" ? next : s)), seeded: "saved" in res };
}

/** The done "sop:" keys of a client's checklist. */
async function doneKeys(client: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const { data, error } = await client.from("onboarding_checklist").select("task_key, done").eq("tenant_id", tenantId);
  fail("checklist", error);
  return new Set(((data ?? []) as Row[]).filter((r) => r.done).map((r) => r.task_key as string));
}

/**
 * The claim as the runner gets it: the client's whole brief rides along, the
 * Client section seeded if it is still empty, and each section carries its
 * manual boxes and their state, so an agent knows what it may tick.
 */
export async function withBrief(client: SupabaseClient, claim: ClaimCore | null): Promise<ClaimResponse | null> {
  if (!claim) return null;
  if (!claim.tenant) return { ...claim, brief: [] };
  // The message is already claimed (running) by now. A brief read that fails
  // must not throw it away: the agent answers without the brief instead.
  try {
    const tenantId = claim.tenant.id;
    const { sections } = await seedClientSection(client, tenantId, await readBrief(client, tenantId));
    const done = await doneKeys(client, tenantId).catch(() => new Set<string>());
    return { ...claim, brief: sections.map((s) => ({ ...s, boxes: claimBoxes(s.section, done) })) };
  } catch (err) {
    console.error(`claim: brief read failed for ${claim.tenant.id}: ${(err as Error).message}`);
    return { ...claim, brief: [] };
  }
}
