import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { agencyTimezone, getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import {
  decorate,
  fetchAllCards,
  fetchLatestReplies,
  fetchStagePage,
  listPipelines,
  loadVerdicts,
  pickColdSmsPipeline,
  type BoardCard,
} from "../../../lib/coldSmsAgency";
import {
  contactsTextedBetween,
  firstTextDays,
  loadFirstTexts,
  syncFirstTexts,
  zoneDayRange,
} from "../../../lib/coldSmsFirstTexts";

// GET /api/admin/cold-sms/board                     -> every column, first page each
// GET /api/admin/cold-sms/board?day=YYYY-MM-DD      -> every card first texted that day
// GET /api/admin/cold-sms/board?stageId=&cursor=    -> the next page of one column
//
// Owner only (no role rule in adminRoles.ts, so every other role is refused).
// Read live from the agency's "Cold SMS" pipeline. Columns are GHL's stages, so a
// stage Jake adds over there (Positive Reply) appears here with no change.
//
// Every card carries the prospect's latest reply, Claude's verdict on it when one
// is on file (./classify fills the rest), and the day the first text went out.
// The day filter is by that first text, in Jake's zone (Jake, 2026-10-12).

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

  const withFirst = async (cards: BoardCard[]) => {
    const firsts = await loadFirstTexts(db, cards.map((c) => c.contactId));
    return cards.map((c) => ({ ...c, firstContactedAt: firsts.get(c.contactId) ?? null }));
  };

  try {
    const pipelines = await listPipelines(agency);
    const board = pickColdSmsPipeline(pipelines);
    if (!board) return Response.json({ configured: true, missing: true, pipelines });

    if (stageId) {
      if (!board.stages.some((s) => s.id === stageId)) {
        return Response.json({ error: "unknown_stage" }, { status: 400 });
      }
      const [replies, page] = await Promise.all([
        fetchLatestReplies(agency),
        fetchStagePage(agency, board.id, stageId, cursor),
      ]);
      const stored = await loadVerdicts(db, page.cards.map((c) => c.contactId));
      return Response.json({
        cards: await withFirst(decorate(page.cards, replies, stored)),
        cursor: page.cursor,
        total: page.total,
      });
    }

    // Keep the first-text dates current before the day list (and a day's cards)
    // are read. A GHL hiccup here only means the newest texts land on the next
    // load. The board's own GHL reads run alongside.
    const synced = syncFirstTexts(db, agency, { pages: SYNC_PAGES }).catch((e) =>
      console.warn("[cold-sms/board] first-text sync", e instanceof Error ? e.message : e),
    );
    const allCards = day ? fetchAllCards(agency, board.id) : null;
    const stagePages = day ? null : Promise.all(board.stages.map((s) => fetchStagePage(agency, board.id, s.id)));
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

    if (day) {
      const range = zoneDayRange(day, zone);
      const [texted, all] = await Promise.all([contactsTextedBetween(db, range.start, range.end), allCards!]);
      const cards = all.cards
        .filter((c) => texted.has(c.contactId))
        .map((c) => ({ ...c, firstContactedAt: texted.get(c.contactId)! }));
      const stored = await loadVerdicts(db, cards.map((c) => c.contactId));
      const shown = decorate(cards, replies, stored);
      return Response.json({
        ...common,
        day,
        truncated: all.truncated,
        stages: board.stages.map((s) => {
          const inStage = shown.filter((c) => c.stageId === s.id);
          return { id: s.id, name: s.name, total: inStage.length, cursor: null, cards: inStage };
        }),
      });
    }

    const pages = await stagePages!;
    const stored = await loadVerdicts(db, pages.flatMap((p) => p.cards.map((c) => c.contactId)));
    const firsts = await loadFirstTexts(db, pages.flatMap((p) => p.cards.map((c) => c.contactId)));

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
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not reach GoHighLevel";
    console.error("[cold-sms/board]", message);
    return Response.json({ error: message.slice(0, 300) }, { status: 502 });
  }
};
