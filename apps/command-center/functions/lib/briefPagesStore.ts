import type { SupabaseClient } from "@supabase/supabase-js";
import { BRIEF_PAGE_IDS, emptyPage, isBriefPageId, pageForAgent, parsePage, type BriefPageId, type BriefPageRow } from "../../src/lib/briefPages";
import { applyPageOps, type PageOp } from "../../src/lib/briefPageOps";
import type { RunnerPageBody } from "../../src/lib/agentWire";
import { isUuid } from "./agentItems";
import { turnChat } from "./clientBriefs";

// The Mission Control brief's structured pages (migration 0178;
// docs/build-plans/mission-control-brief.md). Same version lock as the brief's
// sections (clientBriefs.ts): a save names the version it read, the update
// carries that version as its filter, and a stale one gets the current row.
// Whatever is stored went through parsePage, so a row always reads clean.

type Row = Record<string, unknown>;

export type PageSaveResult = { saved: BriefPageRow } | { conflict: BriefPageRow } | { error: 400; reason: string };

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

function pageFromRow(r: Row): BriefPageRow {
  const page = r.page as BriefPageId;
  const parsed = parsePage(page, r.data);
  return {
    page,
    data: parsed.ok ? parsed.data : emptyPage(page),
    version: Number(r.version) || 0,
    updatedBy: (r.updated_by as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

const unwritten = (page: BriefPageId): BriefPageRow => ({ page, data: emptyPage(page), version: 0, updatedBy: null, updatedAt: null });

/** Both pages in order; one nobody wrote yet is empty at version 0. */
export async function readPages(client: SupabaseClient, tenantId: string): Promise<BriefPageRow[]> {
  const { data, error } = await client.from("client_brief_pages").select("*").eq("tenant_id", tenantId);
  fail("brief pages", error);
  const have = ((data ?? []) as Row[]).filter((r) => isBriefPageId(r.page)).map(pageFromRow);
  return BRIEF_PAGE_IDS.map((p) => have.find((r) => r.page === p) ?? unwritten(p));
}

async function currentPage(client: SupabaseClient, tenantId: string, page: BriefPageId): Promise<BriefPageRow> {
  const { data, error } = await client.from("client_brief_pages").select("*").eq("tenant_id", tenantId).eq("page", page).maybeSingle();
  fail("brief page", error);
  return data ? pageFromRow(data as Row) : unwritten(page);
}

export interface PageSaveInput {
  tenantId: string;
  page: BriefPageId;
  data: unknown;
  version: number;
  by: "jake" | BriefPageId;
}

export async function savePage(client: SupabaseClient, input: PageSaveInput, now: Date = new Date()): Promise<PageSaveResult> {
  const { tenantId, page, version, by } = input;
  if (!isUuid(tenantId)) return { error: 400, reason: "tenant required" };
  if (!isBriefPageId(page)) return { error: 400, reason: "unknown page" };
  if (!Number.isInteger(version) || version < 0) return { error: 400, reason: "version must be a whole number" };
  const parsed = parsePage(page, input.data);
  if (!parsed.ok) return { error: 400, reason: parsed.reason };

  const stamp = now.toISOString();
  if (version === 0) {
    const current = await currentPage(client, tenantId, page);
    if (current.version > 0) return { conflict: current };
    const { data, error } = await client
      .from("client_brief_pages")
      .insert({ tenant_id: tenantId, page, data: parsed.data, version: 1, updated_by: by, updated_at: stamp })
      .select("*")
      .maybeSingle();
    if (error && (error as { code?: string }).code === "23505") return { conflict: await currentPage(client, tenantId, page) };
    fail("brief page insert", error);
    return { saved: pageFromRow(data as Row) };
  }

  const { data, error } = await client
    .from("client_brief_pages")
    .update({ data: parsed.data, version: version + 1, updated_by: by, updated_at: stamp })
    .eq("tenant_id", tenantId)
    .eq("page", page)
    .eq("version", version)
    .select("*");
  fail("brief page update", error);
  const hit = ((data ?? []) as Row[])[0];
  if (hit) return { saved: pageFromRow(hit) };
  return { conflict: await currentPage(client, tenantId, page) };
}

export type AgentPageResult =
  | { tenantId: string; saved: BriefPageRow }
  | { tenantId: string; conflict: BriefPageRow }
  | { error: 400 | 403 | 404 | 409; reason: string };

/**
 * An agent rewrites its own page. The page is the agent of the claimed
 * message's chat (turnChat), so nothing in the request can aim at another.
 */
export async function agentSavePage(client: SupabaseClient, body: RunnerPageBody, now: Date = new Date()): Promise<AgentPageResult> {
  if (!isUuid(body?.messageId) || typeof body.version !== "number") return { error: 400, reason: "messageId and version are required" };
  const who = await turnChat(client, body.messageId);
  if ("error" in who) return who;
  const page = pageForAgent(who.agent);
  if (!page) return { error: 403, reason: "this agent has no brief page" };
  const res = await savePage(client, { tenantId: who.tenantId, page, data: body.data, version: body.version, by: page }, now);
  if ("error" in res) return res;
  return { tenantId: who.tenantId, ...res };
}

/**
 * Jake approved a brief card: its ops go onto the page as it is now, saved
 * under the version that was read. Another writer in between (the agent's own
 * page block, a second Approve) is a conflict, and the ops are tried once more
 * on the newer page. Returns the line for the agent's follow-up; never throws,
 * because the card has already moved and the agent must still hear what landed.
 */
export async function applyBriefCard(client: SupabaseClient, tenantId: string, page: BriefPageId, ops: PageOp[]): Promise<string> {
  try {
    let current = await currentPage(client, tenantId, page);
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = applyPageOps(page, current.data, ops);
      if (!res.ok) return `Brief not updated: ${res.error}.`;
      const saved = await savePage(client, { tenantId, page, data: res.data, version: current.version, by: page });
      if ("saved" in saved) return `Brief updated: ${res.summary.join("; ")}.`;
      if ("error" in saved) return `Brief not updated: ${saved.reason}.`;
      current = saved.conflict;
    }
    return "Brief not updated: the page kept changing while it saved. Put the same change on a new card.";
  } catch (err) {
    return `Brief not updated: ${(err as Error).message}.`;
  }
}
