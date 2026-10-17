import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { BriefSection } from "../../src/lib/agentWire";
import { BRIEF_SECTIONS, briefRevision } from "../../src/lib/clientBrief";
import { markdownToLines } from "../../src/lib/briefMarkdown";
import { readBrief } from "./clientBriefs";
import { createGoogleDoc, findDocInFolder, resolveDriveAccount, rewriteDoc } from "./driveComposio";

// The Client Brief in Google Drive (docs/build-plans/agents.md, Phase 6): one
// Google Doc called "Brief" in the client's Drive folder, rewritten in place
// after every save so its link never changes.
//
// Through Composio, like the rest of the app's Drive writes (driveComposio.ts).
// A Doc is made with a metadata-only Drive create and filled with the Docs
// API's batchUpdate, the same call docFill.ts already makes on client docs, so
// no file bytes have to move.
//
// Never on the save's path: the handler saves, answers, and runs this after
// (waitUntil). It never throws; how it went is written to client_brief_drive,
// which is what the "Saved to Drive" chip reads.

export const BRIEF_DOC_NAME = "Brief";

export interface DocHeading {
  start: number;
  end: number;
  style: "TITLE" | "HEADING_2" | "HEADING_3" | "HEADING_4";
}

export interface DocText {
  text: string;
  headings: DocHeading[];
}

/**
 * The Doc's text and where its headings are. Indexes are the Docs API's: UTF-16
 * code units (which is what a JS string length counts), from 1, end exclusive,
 * each range covering its paragraph's newline. The markdown is read the way
 * the editor reads it (lib/briefMarkdown.ts): marks are taken out, bullets
 * become bullet characters, and a section's own headings become smaller Doc
 * headings under the section's.
 */
export function briefDocText(clientName: string, sections: BriefSection[]): DocText {
  let text = "";
  const headings: DocHeading[] = [];
  const add = (s: string, style?: DocHeading["style"]) => {
    const start = text.length + 1;
    text += s;
    if (style) headings.push({ start, end: text.length + 1, style });
  };
  add(`Brief: ${clientName}\n`, "TITLE");
  for (const def of BRIEF_SECTIONS) {
    const body = sections.find((s) => s.section === def.id)?.body.trim() ?? "";
    if (!body) continue;
    add(`${def.label}\n`, "HEADING_2");
    for (const line of markdownToLines(body)) {
      add(`${line.text}\n`, line.heading === 0 ? undefined : line.heading === 1 ? "HEADING_3" : "HEADING_4");
    }
  }
  return { text, headings };
}

const style = (startIndex: number, endIndex: number, namedStyleType: string) => ({
  updateParagraphStyle: { range: { startIndex, endIndex }, paragraphStyle: { namedStyleType }, fields: "namedStyleType" },
});

/**
 * One batchUpdate that replaces the whole body. endIndex is the body's last
 * index as the Docs API reports it; the final newline can never be deleted, so
 * an empty Doc (endIndex 2) has nothing to clear.
 */
export function docRewriteRequests(endIndex: number, doc: DocText): unknown[] {
  const reqs: unknown[] = [];
  if (endIndex > 2) reqs.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  reqs.push({ insertText: { location: { index: 1 }, text: doc.text } });
  // Inserted text takes the style of the paragraph it lands in (the old title),
  // so everything is set back to normal before the headings are applied.
  reqs.push(style(1, doc.text.length + 1, "NORMAL_TEXT"));
  for (const h of doc.headings) reqs.push(style(h.start, h.end, h.style));
  return reqs;
}

export interface BriefDriveOps {
  account(): Promise<string>;
  findDoc(accountId: string, folderId: string, name: string): Promise<{ id: string; url: string } | null>;
  createDoc(accountId: string, folderId: string, name: string): Promise<{ id: string; url: string }>;
  writeDoc(accountId: string, docId: string, doc: DocText): Promise<void>;
}

export function composioBriefOps(env: Env): BriefDriveOps {
  return {
    account: () => resolveDriveAccount(env),
    findDoc: (a, folder, name) => findDocInFolder(env, a, folder, name),
    createDoc: (a, folder, name) => createGoogleDoc(env, a, folder, name),
    writeDoc: (a, docId, doc) => rewriteDoc(env, a, docId, (endIndex) => docRewriteRequests(endIndex, doc)),
  };
}

type Row = Record<string, unknown>;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const isGone = (e: unknown) => /\b404\b|not found/i.test(errText(e));

// Three writes at most: each one re-reads the brief, so a save that lands while
// the Doc is being written is picked up by the next pass. Two saves syncing at
// once both end on the newest text, because each checks after its own write.
const MAX_PASSES = 3;

export async function syncBriefToDrive(
  client: SupabaseClient,
  tenantId: string,
  ops: BriefDriveOps,
  now: Date = new Date(),
): Promise<void> {
  const { data: prev } = await client.from("client_brief_drive").select("*").eq("tenant_id", tenantId).maybeSingle();
  const record = async (patch: Row) => {
    await client
      .from("client_brief_drive")
      .upsert({ tenant_id: tenantId, ...patch }, { onConflict: "tenant_id" });
  };

  try {
    const { data: folder } = await client
      .from("client_folders")
      .select("folder_id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    const folderId = (folder as Row | null)?.folder_id as string | undefined;
    if (!folderId) {
      await record({ error: "This client has no Drive folder." });
      return;
    }
    const { data: tenant } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const name = ((tenant as Row | null)?.name as string | undefined) ?? "Client";

    const accountId = await ops.account();
    let docId = ((prev as Row | null)?.doc_id as string | null) ?? null;
    let docUrl = ((prev as Row | null)?.doc_url as string | null) ?? null;
    const ensureDoc = async () => {
      const found = (await ops.findDoc(accountId, folderId, BRIEF_DOC_NAME)) ?? (await ops.createDoc(accountId, folderId, BRIEF_DOC_NAME));
      docId = found.id;
      docUrl = found.url;
      // Saved at once, so a sync that fails after this still reuses the Doc.
      await record({ doc_id: docId, doc_url: docUrl });
    };
    if (!docId) await ensureDoc();

    let revision = -1;
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const sections = await readBrief(client, tenantId);
      const rev = briefRevision(sections);
      if (rev === revision) break;
      const doc = briefDocText(name, sections);
      try {
        await ops.writeDoc(accountId, docId as string, doc);
      } catch (e) {
        // Jake deleted or trashed the Doc: make a fresh one and write that.
        if (!isGone(e)) throw e;
        await ensureDoc();
        await ops.writeDoc(accountId, docId as string, doc);
      }
      revision = rev;
    }
    await record({ doc_id: docId, doc_url: docUrl, revision, synced_at: now.toISOString(), error: null });
  } catch (e) {
    await record({ error: errText(e) }).catch(() => undefined);
  }
}
