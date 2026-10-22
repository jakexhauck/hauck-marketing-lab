import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { BriefSection } from "../../src/lib/agentWire";
import { BRIEF_SECTIONS, briefRevision } from "../../src/lib/clientBrief";
import { markdownToLines } from "../../src/lib/briefMarkdown";
import { readBrief } from "./clientBriefs";
import { readPages } from "./briefPagesStore";
import type { AdsPage, BriefPageRow, ResearchPage } from "../../src/lib/briefPages";
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
export function briefDocText(clientName: string, sections: BriefSection[], pages: BriefPageRow[] = []): DocText {
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
  // The Mission Control pages, as plain lines under their own headings.
  for (const page of pages) {
    const lines = pageLines(page);
    if (!lines.length) continue;
    add(`${page.page === "research" ? "Market Research page" : "Ads page"}\n`, "HEADING_2");
    for (const l of lines) add(`${l.text}\n`, l.heading ? "HEADING_3" : undefined);
  }
  return { text, headings };
}

type Line = { text: string; heading?: boolean };
const joinBits = (...bits: (string | number | null | undefined)[]) => bits.filter((b) => b !== null && b !== undefined && b !== "").join(" · ");

/** A page as Doc lines: nothing for an empty page, ad copy in full. */
export function pageLines(row: BriefPageRow): Line[] {
  const out: Line[] = [];
  if (row.page === "ads") {
    const p = row.data as AdsPage;
    for (const c of p.campaigns) {
      out.push({ text: c.name || "Campaign", heading: true });
      if (c.offer) out.push({ text: `Offer: ${c.offer}` });
      const plan = joinBits(c.objective, c.dailySpend !== null ? `$${c.dailySpend}/day` : null, c.budgetType, c.launchDate ? `launch ${c.launchDate}` : null);
      if (plan) out.push({ text: plan });
      for (const s of c.adSets) out.push({ text: `• Ad set: ${joinBits(s.name, s.targeting, s.form)}` });
      for (const a of c.angles) out.push({ text: `• Angle: ${joinBits(a.name, a.pitch, a.status)}` });
      for (const a of c.ads) {
        out.push({ text: `• Ad: ${joinBits(a.name, a.type, a.angle, a.status)}` });
        if (a.headline) out.push({ text: `Headline: ${a.headline}` });
        // Line breaks inside the copy become their own Doc lines.
        for (const part of a.primaryText.split(/\r?\n/)) if (part.trim()) out.push({ text: part.trim() });
      }
    }
    if (p.headlines.length) {
      out.push({ text: "Headlines", heading: true });
      for (const h of p.headlines) out.push({ text: `• ${joinBits(h.angle, h.text)}` });
    }
    return out;
  }
  const r = row.data as ResearchPage;
  if (r.zips.length) {
    out.push({ text: "Market", heading: true });
    for (const z of r.zips)
      out.push({ text: `• ${joinBits(z.zip, z.area, z.population !== null ? `pop ${z.population}` : null, z.medianHomeValue !== null ? `home $${z.medianHomeValue}` : null)}` });
  }
  if (r.competitors.length) {
    out.push({ text: "Competitors", heading: true });
    for (const c of r.competitors)
      out.push({
        text: `• ${joinBits(c.name, c.googleRating !== null ? `${c.googleRating} stars` : null, c.googleReviews !== null ? `${c.googleReviews} reviews` : null, c.metaAdsLive !== null ? `${c.metaAdsLive} Meta ads` : null, c.mainAngle)}`,
      });
  }
  if (r.painPoints.length) {
    out.push({ text: "Pain points", heading: true });
    for (const p of r.painPoints) out.push({ text: `• ${joinBits(p.title, p.sharePct !== null ? `${p.sharePct}%` : null, p.quote ? `"${p.quote}"` : null)}` });
  }
  return out;
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
      const [sections, pages] = await Promise.all([readBrief(client, tenantId), readPages(client, tenantId)]);
      const rev = briefRevision([...sections, ...pages]);
      if (rev === revision) break;
      const doc = briefDocText(name, sections, pages);
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
