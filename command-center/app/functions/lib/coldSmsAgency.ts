// Cold SMS > Pipeline: the GoHighLevel and database reads behind the board.
//
// Everything here is the agency's OWN sub-account (agencyGhl.ts), never a
// client's. The board is read live from GHL on every load, the same rule as the
// Cold Call board: a stored copy would show a card in a stage GHL's workflow
// moved it out of ten minutes ago.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ghlFetch, ghlJson, type GhlContext, type GhlConversation } from "./ghl";
import {
  COLD_SMS_PIPELINE,
  autoSortMoves,
  findSortStages,
  isVerdict,
  replyKey,
  variationOf,
  type Verdict,
} from "./coldSmsBoard";

export const STAGE_PAGE = 50;

// How far back the inbound-reply lookup reads. Conversations come newest first,
// so four pages is the latest 400 replies, which is every reply this pipeline
// has had so far several times over.
const INBOUND_PAGES = 4;

export interface RawPipeline {
  id: string;
  name: string;
  stages?: { id: string; name: string; position?: number }[];
}

export interface ShapedPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export function shapePipeline(p: RawPipeline): ShapedPipeline {
  return {
    id: p.id,
    name: p.name,
    stages: (p.stages ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((s) => ({ id: s.id, name: s.name })),
  };
}

export async function listPipelines(agency: GhlContext): Promise<ShapedPipeline[]> {
  const res = await ghlJson<{ pipelines?: RawPipeline[] }>(
    agency,
    `/opportunities/pipelines?locationId=${encodeURIComponent(agency.locationId)}`,
  );
  return (res.pipelines ?? []).map(shapePipeline);
}

export function pickColdSmsPipeline(pipelines: ShapedPipeline[]): ShapedPipeline | null {
  return pipelines.find((p) => COLD_SMS_PIPELINE.test(p.name)) ?? null;
}

// ---------------------------------------------------------------------------
// One stage, one page.

interface RawOpp {
  id: string;
  name?: string;
  pipelineStageId?: string;
  contactId?: string;
  lastStageChangeAt?: string;
  updatedAt?: string;
  createdAt?: string;
  contact?: { id?: string; name?: string; companyName?: string; phone?: string; tags?: string[] } | null;
}

interface OppSearch {
  opportunities?: RawOpp[];
  meta?: { total?: number; startAfterId?: string | null; startAfter?: string | number | null };
}

export interface ReplyInfo {
  body: string;
  at: number; // epoch ms
}

export interface BoardCard {
  id: string; // opportunity id
  contactId: string;
  business: string;
  person: string;
  phone: string;
  tags: string[];
  variation: string | null;
  stageId: string;
  movedAt: string | null;
  // When the first cold text went out: the contact's earliest outbound message
  // (cold_sms_first_texts, 0159). NOT the opportunity's createdAt, which is the
  // import, and a batch imported at 4pm is often texted the next morning.
  firstContactedAt: string | null;
  reply: ReplyInfo | null;
  verdict: Verdict | null;
}

export interface StagePage {
  total: number;
  cards: BoardCard[];
  cursor: string | null;
}

export function shapeCard(o: RawOpp): BoardCard {
  const c = o.contact ?? {};
  const business = (c.companyName ?? "").trim() || (o.name ?? "").trim() || (c.name ?? "").trim() || "Unnamed";
  const person = (c.name ?? "").trim();
  return {
    id: o.id,
    contactId: c.id ?? o.contactId ?? "",
    business,
    person: person && person.toLowerCase() !== business.toLowerCase() ? person : "",
    phone: c.phone ?? "",
    tags: c.tags ?? [],
    variation: variationOf(c.tags),
    stageId: o.pipelineStageId ?? "",
    movedAt: o.lastStageChangeAt ?? o.updatedAt ?? o.createdAt ?? null,
    firstContactedAt: null,
    reply: null,
    verdict: null,
  };
}

// The cursor is GHL's own (startAfterId|startAfter), handed back verbatim.
// Every card on the pipeline, for the day filter: GHL cannot filter by when a
// contact was first texted, so the whole board is read and filtered here. Page
// one says the total; the rest are fetched side by side by page number.
const ALL_PAGES_CAP = 25;

export async function fetchAllCards(
  agency: GhlContext,
  pipelineId: string,
): Promise<{ cards: BoardCard[]; truncated: boolean }> {
  const path = (p: number) =>
    `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
    `&pipeline_id=${encodeURIComponent(pipelineId)}&limit=100&page=${p}`;
  const first = await ghlJson<OppSearch>(agency, path(1));
  const total = first.meta?.total ?? 0;
  const pageCount = Math.min(ALL_PAGES_CAP, Math.ceil(total / 100));
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => ghlJson<OppSearch>(agency, path(i + 2))),
  );
  const seen = new Set<string>();
  const cards: BoardCard[] = [];
  for (const page of [first, ...rest]) {
    for (const o of page.opportunities ?? []) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      cards.push(shapeCard(o));
    }
  }
  return { cards, truncated: Math.ceil(total / 100) > ALL_PAGES_CAP };
}

export async function fetchStagePage(
  agency: GhlContext,
  pipelineId: string,
  stageId: string,
  cursor?: string | null,
): Promise<StagePage> {
  let path =
    `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
    `&pipeline_id=${encodeURIComponent(pipelineId)}` +
    `&pipeline_stage_id=${encodeURIComponent(stageId)}&limit=${STAGE_PAGE}`;
  if (cursor) {
    const [id, at] = cursor.split("|");
    if (id) path += `&startAfterId=${encodeURIComponent(id)}`;
    if (at) path += `&startAfter=${encodeURIComponent(at)}`;
  }
  const data = await ghlJson<OppSearch>(agency, path);
  const page = data.opportunities ?? [];
  const nextId = data.meta?.startAfterId;
  const nextAt = data.meta?.startAfter;
  return {
    total: data.meta?.total ?? page.length,
    cards: page.map(shapeCard),
    cursor: page.length >= STAGE_PAGE && nextId ? `${nextId}|${nextAt ?? ""}` : null,
  };
}

// ---------------------------------------------------------------------------
// Replies: who last texted in, and what they said.

function ms(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  const t = +new Date(v ?? "");
  return Number.isFinite(t) ? t : 0;
}

// contactId -> their newest reply, for every conversation whose LAST message is
// theirs. One whose last message is ours (Jake answered) is not in this map; its
// reply is still on file in cold_sms_reply_verdicts from when it came in.
export async function fetchLatestReplies(agency: GhlContext): Promise<Map<string, ReplyInfo>> {
  const out = new Map<string, ReplyInfo>();
  const base =
    `/conversations/search?locationId=${encodeURIComponent(agency.locationId)}` +
    `&limit=100&sort=desc&sortBy=last_message_date&lastMessageDirection=inbound`;
  let after: number | undefined;
  for (let i = 0; i < INBOUND_PAGES; i++) {
    const data = await ghlJson<{ conversations?: GhlConversation[] }>(
      agency,
      after === undefined ? base : `${base}&startAfterDate=${after}`,
    );
    const page = data.conversations ?? [];
    for (const c of page) {
      if (!c.contactId || out.has(c.contactId)) continue;
      if ((c.lastMessageDirection ?? "inbound") !== "inbound") continue;
      out.set(c.contactId, { body: (c.lastMessageBody ?? "").trim(), at: ms(c.lastMessageDate) });
    }
    if (page.length < 100) break;
    const next = ms(page[page.length - 1].lastMessageDate);
    if (!next || next === after) break;
    after = next;
  }
  return out;
}

export interface StoredVerdict {
  contact_id: string;
  reply_key: string;
  reply_body: string;
  verdict: Verdict;
  classified_at: string;
}

export async function loadVerdicts(
  db: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, StoredVerdict>> {
  const out = new Map<string, StoredVerdict>();
  const ids = [...new Set(contactIds.filter(Boolean))];
  // PostgREST puts an `in` list in the URL; chunk so a long column never hits
  // a URL length limit.
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db
      .from("cold_sms_reply_verdicts")
      .select("contact_id, reply_key, reply_body, verdict, classified_at")
      .in("contact_id", ids.slice(i, i + 150));
    if (error) throw new Error(`cold_sms_reply_verdicts read failed: ${error.message}`);
    for (const r of (data ?? []) as StoredVerdict[]) if (isVerdict(r.verdict)) out.set(r.contact_id, r);
  }
  return out;
}

// Put the reply and verdict on each card. A fresh reply GHL has that the stored
// verdict was not for shows the reply with NO verdict yet: a stale label on a
// new message is worse than a blank one for the few seconds until it is read.
export function decorate(
  cards: BoardCard[],
  replies: Map<string, ReplyInfo>,
  stored: Map<string, StoredVerdict>,
): BoardCard[] {
  return cards.map((c) => {
    const live = replies.get(c.contactId) ?? null;
    const row = stored.get(c.contactId) ?? null;
    if (live) {
      const fresh = row && row.reply_key === replyKey(live.at);
      return { ...c, reply: live, verdict: fresh ? row!.verdict : null };
    }
    if (row) return { ...c, reply: { body: row.reply_body, at: Number(row.reply_key) || 0 }, verdict: row.verdict };
    return c;
  });
}

// ---------------------------------------------------------------------------
// The auto-sort: every card in Replied whose current reply has a verdict moves
// to Positive Reply or Negative Reply in GHL (rule in coldSmsBoard.ts). Run after
// each labelling round, so a backlog labelled before the sort existed is swept
// on the next board load too. Returns how many moved.

const REPLIED_PAGES = 10;
const MOVES_AT_ONCE = 5;

export async function sortRepliedCards(
  db: SupabaseClient,
  agency: GhlContext,
  replies: Map<string, ReplyInfo>,
): Promise<number> {
  const board = pickColdSmsPipeline(await listPipelines(agency));
  const stages = board ? findSortStages(board.stages) : null;
  if (!board || !stages) return 0;

  const cards: BoardCard[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < REPLIED_PAGES; i++) {
    const page = await fetchStagePage(agency, board.id, stages.replied, cursor);
    cards.push(...page.cards);
    cursor = page.cursor;
    if (!cursor) break;
  }
  if (cards.length === 0) return 0;

  const stored = await loadVerdicts(db, cards.map((c) => c.contactId));
  const moves = autoSortMoves(decorate(cards, replies, stored), stages);
  let moved = 0;
  for (let i = 0; i < moves.length; i += MOVES_AT_ONCE) {
    const results = await Promise.all(
      moves.slice(i, i + MOVES_AT_ONCE).map(async (m) => {
        const res = await ghlFetch(agency, `/opportunities/${encodeURIComponent(m.id)}`, {
          method: "PUT",
          body: JSON.stringify({ pipelineId: board.id, pipelineStageId: m.stageId }),
        });
        if (!res.ok) console.warn("[coldSmsAgency] sort move", m.id, res.status, (await res.text()).slice(0, 200));
        return res.ok;
      }),
    );
    moved += results.filter(Boolean).length;
  }
  return moved;
}
