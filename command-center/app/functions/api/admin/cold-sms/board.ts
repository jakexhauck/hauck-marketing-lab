import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import {
  decorate,
  fetchLatestReplies,
  fetchStagePage,
  listPipelines,
  loadVerdicts,
  pickColdSmsPipeline,
} from "../../../lib/coldSmsAgency";

// GET /api/admin/cold-sms/board                         -> every column, first page each
// GET /api/admin/cold-sms/board?stageId=&cursor=        -> the next page of one column
//
// Owner only (no role rule in adminRoles.ts, so every other role is refused).
// Read live from the agency's "Cold SMS" pipeline. Columns are GHL's stages, so a
// stage Jake adds over there (Positive Reply) appears here with no change.
//
// Every card carries the prospect's latest reply and Claude's verdict on it when
// one is on file; ./classify fills in the ones that are not.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ configured: false });
  const db = getServiceClient(ctx.env);
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });

  const agency = getAgencyGhlContext(ctx.env);
  const params = new URL(ctx.request.url).searchParams;
  const stageId = (params.get("stageId") ?? "").trim();
  const cursor = (params.get("cursor") ?? "").trim() || null;

  try {
    const pipelines = await listPipelines(agency);
    const board = pickColdSmsPipeline(pipelines);
    if (!board) return Response.json({ configured: true, missing: true, pipelines });

    const replies = await fetchLatestReplies(agency);

    if (stageId) {
      if (!board.stages.some((s) => s.id === stageId)) {
        return Response.json({ error: "unknown_stage" }, { status: 400 });
      }
      const page = await fetchStagePage(agency, board.id, stageId, cursor);
      const stored = await loadVerdicts(db, page.cards.map((c) => c.contactId));
      return Response.json({ cards: decorate(page.cards, replies, stored), cursor: page.cursor, total: page.total });
    }

    const pages = await Promise.all(board.stages.map((s) => fetchStagePage(agency, board.id, s.id)));
    const stored = await loadVerdicts(db, pages.flatMap((p) => p.cards.map((c) => c.contactId)));

    return Response.json({
      configured: true,
      locationId: agency.locationId,
      pipeline: { id: board.id, name: board.name },
      // Every pipeline, for the card's "move to" menu (Sales > Call Booked, ...).
      pipelines,
      stages: board.stages.map((s, i) => ({
        id: s.id,
        name: s.name,
        total: pages[i].total,
        cursor: pages[i].cursor,
        cards: decorate(pages[i].cards, replies, stored),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not reach GoHighLevel";
    console.error("[cold-sms/board]", message);
    return Response.json({ error: message.slice(0, 300) }, { status: 502 });
  }
};
