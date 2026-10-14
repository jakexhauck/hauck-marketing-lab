import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { agencyTimezone, getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import {
  PAGES_PER_PART,
  countCardPages,
  decorate,
  fetchCardPart,
  fetchLatestReplies,
  fetchStagePage,
  listPipelines,
  loadVerdicts,
  pickColdSmsPipeline,
  withFollowUps,
  type BoardCard,
} from "../../../lib/coldSmsAgency";
import {
  contactsTextedBetween,
  firstTextDays,
  loadFirstTexts,
  syncFirstTexts,
  zoneDayRange,
} from "../../../lib/coldSmsFirstTexts";
import { pickSalesPipeline } from "../../../lib/salesPipeline";

// GET /api/admin/cold-sms/board                     -> every column, first page each
// GET /api/admin/cold-sms/board?day=YYYY-MM-DD      -> the columns, and how many parts to read
// GET /api/admin/cold-sms/board?day=&part=k&pages=n -> part k of that day's cards
//   (the client reads every part side by side; one request for the whole pipeline
//   went past Cloudflare's 50 outside calls, see coldSmsAgency.ts)
// GET /api/admin/cold-sms/board?stageId=&cursor=    -> the next page of one column
// Add &board=sales to any of the column reads for the agency's Sales pipeline
// instead (Sales > Sales Pipeline, Jake 2026-10-13: the same board, same panel,
// same menu). Sales has no day filter and no Claude verdicts: its cards are
// booked meetings, not cold replies.
//
// Owner only (no role rule in adminRoles.ts, so every other role is refused).
// Read live from the agency's "Cold SMS" pipeline. Columns are GHL's stages, so a
// stage Jake adds over there (Positive Reply) appears here with no change.
//
// Every card carries the prospect's latest reply, Claude's verdict on it when one
// is on file (./classify fills the rest), and the day the first text went out.
// The day filter is by that first text, in Jake's zone (Jake, 2026-10-12).
// Each card also carries its follow-up day (0161), set from the right-click menu.

// Export pages read per board load to keep first-text dates current. Today's
// texts are a handful of pages; a fresh table backfills over a few loads.
const SYNC_PAGES = 6;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ configured: false });
  const db = getServiceClient(ctx.env);
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });

  const agency = getAgencyGhlContext(ctx.env);
  const zone = agencyTimezone(ctx.env);
  const params = new URL(ctx.request.url).searchParams;
  const stageId = (params.get("stageId") ?? "").trim();
  const cursor = (params.get("cursor") ?? "").trim() || null;
  const day = (params.get("day") ?? "").trim();
  if (day && !DAY.test(day)) return Response.json({ error: "bad_day" }, { status: 400 });
  const partRaw = params.get("part");
  const part = partRaw === null ? null : Number(partRaw);
  const pageCount = Number(params.get("pages") ?? "0");
  const sales = params.get("board") === "sales";
  if (sales && day) return Response.json({ error: "bad_day" }, { status: 400 });
  if (part !== null && (!day || !Number.isInteger(part) || part < 0 || !Number.isInteger(pageCount) || pageCount < 0)) {
    return Response.json({ error: "bad_part" }, { status: 400 });
  }

  const withFirst = async (cards: BoardCard[]) => {
    const firsts = await loadFirstTexts(db, cards.map((c) => c.contactId));
    return withFollowUps(db, cards.map((c) => ({ ...c, firstContactedAt: firsts.get(c.contactId) ?? null })));
  };

  try {
    const pipelines = await listPipelines(agency);
    const board = sales ? pickSalesPipeline(pipelines) : pickColdSmsPipeline(pipelines);
    if (!board) return Response.json({ configured: true, missing: true, pipelines });

    // One part of a day: its pages, kept to the prospects first texted that day.
    if (part !== null) {
      const range = zoneDayRange(day, zone);
      const [texted, cards, replies] = await Promise.all([
        contactsTextedBetween(db, range.start, range.end),
        fetchCardPart(agency, board.id, part, pageCount),
        fetchLatestReplies(agency),
      ]);
      const mine = cards
        .filter((c) => texted.has(c.contactId))
        .map((c) => ({ ...c, firstContactedAt: texted.get(c.contactId)! }));
      const stored = await loadVerdicts(db, mine.map((c) => c.contactId));
      return Response.json({ cards: await withFollowUps(db, decorate(mine, replies, stored)) });
    }

    if (stageId) {
      if (!board.stages.some((s) => s.id === stageId)) {
        return Response.json({ error: "unknown_stage" }, { status: 400 });
      }
      const [replies, page] = await Promise.all([
        fetchLatestReplies(agency),
        fetchStagePage(agency, board.id, stageId, cursor),
      ]);
      const stored = sales ? new Map() : await loadVerdicts(db, page.cards.map((c) => c.contactId));
      return Response.json({
        cards: await withFirst(decorate(page.cards, replies, stored)),
        cursor: page.cursor,
        total: page.total,
      });
    }

    if (sales) {
      const [pages, replies] = await Promise.all([
        Promise.all(board.stages.map((s) => fetchStagePage(agency, board.id, s.id))),
        fetchLatestReplies(agency),
      ]);
      const follow = new Map((await withFollowUps(db, pages.flatMap((p) => p.cards))).map((c) => [c.contactId, c]));
      return Response.json({
        configured: true,
        locationId: agency.locationId,
        pipeline: { id: board.id, name: board.name },
        pipelines,
        timezone: zone,
        stages: board.stages.map((s, i) => ({
          id: s.id,
          name: s.name,
          total: pages[i].total,
          cursor: pages[i].cursor,
          cards: decorate(pages[i].cards, replies, new Map()).map((c) => ({
            ...c,
            followUpOn: follow.get(c.contactId)?.followUpOn ?? null,
            followUpTime: follow.get(c.contactId)?.followUpTime ?? null,
            followUpNote: follow.get(c.contactId)?.followUpNote ?? "",
          })),
        })),
      });
    }

    // Keep the first-text dates current before the day list (and a day's cards)
    // are read. A GHL hiccup here only means the newest texts land on the next
    // load. The board's own GHL reads run alongside.
    const synced = syncFirstTexts(db, agency, { pages: SYNC_PAGES }).catch((e) =>
      console.warn("[cold-sms/board] first-text sync", e instanceof Error ? e.message : e),
    );
    if (day) {
      const [days, pages] = await Promise.all([
        synced.then(() => firstTextDays(db, zone)),
        countCardPages(agency, board.id),
      ]);
      return Response.json({
        configured: true,
        locationId: agency.locationId,
        pipeline: { id: board.id, name: board.name },
        pipelines,
        timezone: zone,
        days,
        day,
        pages,
        parts: Math.ceil(pages / PAGES_PER_PART),
        stages: board.stages.map((s) => ({ id: s.id, name: s.name, total: 0, cursor: null, cards: [] })),
      });
    }

    const stagePages = Promise.all(board.stages.map((s) => fetchStagePage(agency, board.id, s.id)));
    const [days, replies] = await Promise.all([synced.then(() => firstTextDays(db, zone)), fetchLatestReplies(agency)]);

    const common = {
      configured: true,
      locationId: agency.locationId,
      pipeline: { id: board.id, name: board.name },
      // Every pipeline, for the card's "move to" menu (Sales > Call Booked, ...).
      pipelines,
      timezone: zone,
      days,
    };

    const pages = await stagePages;
    const stored = await loadVerdicts(db, pages.flatMap((p) => p.cards.map((c) => c.contactId)));
    const firsts = await loadFirstTexts(db, pages.flatMap((p) => p.cards.map((c) => c.contactId)));
    const follow = new Map((await withFollowUps(db, pages.flatMap((p) => p.cards))).map((c) => [c.contactId, c]));

    return Response.json({
      ...common,
      stages: board.stages.map((s, i) => ({
        id: s.id,
        name: s.name,
        total: pages[i].total,
        cursor: pages[i].cursor,
        cards: decorate(pages[i].cards, replies, stored).map((c) => ({
          ...c,
          firstContactedAt: firsts.get(c.contactId) ?? null,
          followUpOn: follow.get(c.contactId)?.followUpOn ?? null,
          followUpTime: follow.get(c.contactId)?.followUpTime ?? null,
          followUpNote: follow.get(c.contactId)?.followUpNote ?? "",
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not reach GoHighLevel";
    console.error("[cold-sms/board]", message);
    return Response.json({ error: message.slice(0, 300) }, { status: 502 });
  }
};
