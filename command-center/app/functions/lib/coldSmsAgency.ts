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
  type SortStages,
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
  pipelineId?: string;
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
  // Follow-up from cold_sms_followups (0161, 0163): day in Jake's zone, optional
  // "HH:MM", and Jake's note.
  followUpOn?: string | null;
  followUpTime?: string | null;
  followUpNote?: string;
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
//
// Every card on the pipeline, for the day filter: GHL cannot filter by when a
// contact was first texted, so the whole board is read and filtered here. The
// pipeline is past 30 pages and Cloudflare allows 50 outside calls per request,
// so the day view reads it in PARTS, one request each, side by side (2026-10-13,
// the board hung on "Reading the board" once a day's view crossed the cap).

export const OPP_PAGE = 100;
export const PAGES_PER_PART = 10;

const oppPagePath = (agency: GhlContext, pipelineId: string, page: number, limit = OPP_PAGE) =>
  `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
  `&pipeline_id=${encodeURIComponent(pipelineId)}&limit=${limit}&page=${page}`;

// How many GHL pages the pipeline is, from one tiny read.
export async function countCardPages(agency: GhlContext, pipelineId: string): Promise<number> {
  const first = await ghlJson<OppSearch>(agency, oppPagePath(agency, pipelineId, 1, 1));
  return Math.ceil((first.meta?.total ?? 0) / OPP_PAGE);
}

// Part k: GHL pages k*PAGES_PER_PART+1 up to `pageCount`, read side by side.
export async function fetchCardPart(
  agency: GhlContext,
  pipelineId: string,
  part: number,
  pageCount: number,
): Promise<BoardCard[]> {
  const from = part * PAGES_PER_PART + 1;
  const to = Math.min(pageCount, from + PAGES_PER_PART - 1);
  if (to < from) return [];
  const pages = await Promise.all(
    Array.from({ length: to - from + 1 }, (_, i) => ghlJson<OppSearch>(agency, oppPagePath(agency, pipelineId, from + i))),
  );
  const seen = new Set<string>();
  const cards: BoardCard[] = [];
  for (const page of pages) {
    for (const o of page.opportunities ?? []) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      cards.push(shapeCard(o));
    }
  }
  return cards;
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
// to Positive Reply or Negative Reply in GHL (rule in coldSmsSort.ts).
//
// Two halves so ./classify can read the Replied column WHILE Claude is labelling
// (Jake, 2026-10-13: the sort felt laggy), then move everything in one go.

const REPLIED_PAGES = 10;
const MOVES_AT_ONCE = 10;

export interface SortTarget {
  pipelineId: string;
  stages: SortStages;
  cards: BoardCard[];
}

export async function loadSortTarget(agency: GhlContext): Promise<SortTarget | null> {
  const board = pickColdSmsPipeline(await listPipelines(agency));
  const stages = board ? findSortStages(board.stages) : null;
  if (!board || !stages) return null;

  const cards: BoardCard[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < REPLIED_PAGES; i++) {
    const page = await fetchStagePage(agency, board.id, stages.replied, cursor);
    cards.push(...page.cards);
    cursor = page.cursor;
    if (!cursor) break;
  }
  return { pipelineId: board.id, stages, cards };
}

// Moves the cards and returns the ones GHL took, so the board can match.
export async function applySort(
  db: SupabaseClient,
  agency: GhlContext,
  target: SortTarget,
  replies: Map<string, ReplyInfo>,
): Promise<{ id: string; stageId: string }[]> {
  if (target.cards.length === 0) return [];
  const stored = await loadVerdicts(db, target.cards.map((c) => c.contactId));
  const moves = autoSortMoves(decorate(target.cards, replies, stored), target.stages);
  const done: { id: string; stageId: string }[] = [];
  for (let i = 0; i < moves.length; i += MOVES_AT_ONCE) {
    const results = await Promise.all(
      moves.slice(i, i + MOVES_AT_ONCE).map(async (m) => {
        const res = await ghlFetch(agency, `/opportunities/${encodeURIComponent(m.id)}`, {
          method: "PUT",
          body: JSON.stringify({ pipelineId: target.pipelineId, pipelineStageId: m.stageId }),
        });
        if (!res.ok) console.warn("[coldSmsAgency] sort move", m.id, res.status, (await res.text()).slice(0, 200));
        return res.ok ? m : null;
      }),
    );
    for (const r of results) if (r) done.push(r);
  }
  return done;
}

// ---------------------------------------------------------------------------
// A booked prospect leaves the Cold SMS board (Jake, 2026-10-13): every Cold SMS
// opportunity on the contact is deleted. Other pipelines' cards (Sales > Call
// Booked) are never touched. Returns the ids GHL deleted.

export async function removeColdSmsCards(agency: GhlContext, contactId: string): Promise<string[]> {
  const board = pickColdSmsPipeline(await listPipelines(agency));
  return board ? removeColdSmsCardsIn(agency, board.id, contactId) : [];
}

// The same, when the Cold SMS pipeline id is already known: one search plus one
// delete per card.
export async function removeColdSmsCardsIn(agency: GhlContext, pipelineId: string, contactId: string): Promise<string[]> {
  const res = await ghlJson<OppSearch>(
    agency,
    `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
      `&contact_id=${encodeURIComponent(contactId)}&pipeline_id=${encodeURIComponent(pipelineId)}&limit=20`,
  );
  // GHL has ignored filters before (dates on this same search), so the pipeline
  // and contact are checked here too rather than trusted.
  const mine = (res.opportunities ?? []).filter(
    (o) => o.pipelineId === pipelineId && (o.contactId ?? o.contact?.id) === contactId,
  );
  const gone: string[] = [];
  for (const o of mine) {
    const del = await ghlFetch(agency, `/opportunities/${encodeURIComponent(o.id)}`, { method: "DELETE" });
    if (del.ok) gone.push(o.id);
    else console.warn("[coldSmsAgency] remove card", o.id, del.status, (await del.text()).slice(0, 200));
  }
  return gone;
}

// ---------------------------------------------------------------------------
// Booked prospects off the Cold SMS board, wherever they were booked (Jake,
// 2026-10-13). Anyone with a card in the "Sales" pipeline was booked; their
// Cold SMS card is deleted once and the contact remembered (0162), so a load
// only looks up new bookings. Capped per call to stay under Cloudflare's 50
// outside calls; the rest go on the next load.

const SALES_PIPELINE = /^\s*sales\s*$/i;
const SALES_PAGES = 5;
const SWEEP_PER_CALL = 18;

export async function sweepBookedFromColdSms(
  db: SupabaseClient,
  agency: GhlContext,
): Promise<{ removed: string[]; remaining: number }> {
  const pipelines = await listPipelines(agency);
  const board = pickColdSmsPipeline(pipelines);
  const sales = pipelines.find((p) => SALES_PIPELINE.test(p.name));
  if (!board || !sales) return { removed: [], remaining: 0 };

  const booked = new Set<string>();
  for (let page = 1; page <= SALES_PAGES; page++) {
    const res = await ghlJson<OppSearch>(
      agency,
      `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
        `&pipeline_id=${encodeURIComponent(sales.id)}&limit=100&page=${page}`,
    );
    const opps = res.opportunities ?? [];
    for (const o of opps) {
      const id = o.contactId ?? o.contact?.id;
      if (id && o.pipelineId === sales.id) booked.add(id);
    }
    if (opps.length < 100) break;
  }

  const ids = [...booked];
  const done = new Set<string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from("cold_sms_booked_swept").select("contact_id").in("contact_id", ids.slice(i, i + 150));
    if (error) throw new Error(`cold_sms_booked_swept read failed: ${error.message}`);
    for (const r of (data ?? []) as { contact_id: string }[]) done.add(r.contact_id);
  }
  const todo = ids.filter((id) => !done.has(id));
  const now = todo.slice(0, SWEEP_PER_CALL);

  const removed: string[] = [];
  const rows: { contact_id: string; removed: number; swept_at: string }[] = [];
  for (const contactId of now) {
    try {
      const gone = await removeColdSmsCardsIn(agency, board.id, contactId);
      removed.push(...gone);
      rows.push({ contact_id: contactId, removed: gone.length, swept_at: new Date().toISOString() });
    } catch (err) {
      // Not remembered, so the next load tries this contact again.
      console.warn("[coldSmsAgency] sweep", contactId, err instanceof Error ? err.message : err);
    }
  }
  if (rows.length) {
    const { error } = await db.from("cold_sms_booked_swept").upsert(rows, { onConflict: "contact_id" });
    if (error) console.warn("[coldSmsAgency] sweep save", error.message);
  }
  return { removed, remaining: todo.length - now.length };
}

export interface FollowUp {
  day: string;
  time: string | null;
  note: string;
}

// contactId -> follow-up (day, time, note), for the cards on screen (0161, 0163).
export async function loadFollowUps(db: SupabaseClient, contactIds: string[]): Promise<Map<string, FollowUp>> {
  const out = new Map<string, FollowUp>();
  const ids = [...new Set(contactIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db
      .from("cold_sms_followups")
      .select("contact_id, follow_up_on, follow_up_time, note")
      .in("contact_id", ids.slice(i, i + 150));
    if (error) throw new Error(`cold_sms_followups read failed: ${error.message}`);
    for (const r of (data ?? []) as { contact_id: string; follow_up_on: string; follow_up_time: string | null; note: string | null }[]) {
      out.set(r.contact_id, { day: r.follow_up_on, time: r.follow_up_time ?? null, note: r.note ?? "" });
    }
  }
  return out;
}

export async function withFollowUps<T extends { contactId: string }>(
  db: SupabaseClient,
  cards: T[],
): Promise<(T & { followUpOn: string | null; followUpTime: string | null; followUpNote: string })[]> {
  const all = await loadFollowUps(db, cards.map((c) => c.contactId));
  return cards.map((c) => {
    const f = all.get(c.contactId);
    return { ...c, followUpOn: f?.day ?? null, followUpTime: f?.time ?? null, followUpNote: f?.note ?? "" };
  });
}
