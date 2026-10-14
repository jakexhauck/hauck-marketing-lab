import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { ghlJson } from "../../../../lib/ghl";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../../lib/agencyGhl";
import type { RawOpportunity } from "../../../../lib/agencyPipelines";
import {
  existingLookupKeys,
  pickColdCallPipeline,
  planLeadSync,
  type ExistingLead,
} from "../../../../lib/coldCallSync";
import { LEAD_STATUSES, SELECT, toLead } from "../leads";

// POST /api/admin/tracker/leads/sync-ghl
//
// Pull the cold calling board out of the agency's GoHighLevel account and add
// whatever the book is missing.
//
// This is the return leg of a road that was one-way. agencyCrm.ts pushes a
// contact and a tag; every stage move belongs to Jake's workflows over there.
// What had no path at all was a prospect created IN GoHighLevel: not in the
// book, so in no queue, no count and nobody's day.
//
// Still not two-way. Nothing here writes to GoHighLevel, creates an opportunity
// or moves a stage. It reads and it inserts locally.
//
// Safe to call repeatedly, which is what lets the section fire it on open: a
// prospect is matched by GHL contact id and by phone number (country code and
// punctuation ignored), so the second run adds nothing. planLeadSync in
// functions/lib/coldCallSync.ts owns those rules and is unit-tested on them.

interface RawPipeline {
  id: string;
  name: string;
  stages?: { id: string; name: string; position?: number }[];
}

// Postgres "undefined_column": this code has shipped but 0053 has not run. The
// link columns are how the sync stays idempotent, so losing them is worth
// saying out loud rather than silently inserting duplicates on every call.
const UNDEFINED_COLUMN = "42703";

// GHL's per-request cap on an opportunity search.
const PAGE_SIZE = 100;
// A runaway guard, not an expectation: 20 pages is 2,000 prospects, far past any
// board this operation will hold. Hitting it is logged, never swallowed.
const MAX_SYNC_PAGES = 20;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;

  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({ configured: false, added: 0, leads: [] });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const agency = getAgencyGhlContext(ctx.env);

  let cards: RawOpportunity[];
  let pipelineName: string;
  let stageNameById: Map<string, string>;
  try {
    const res = await ghlJson<{ pipelines?: RawPipeline[] }>(
      agency,
      `/opportunities/pipelines?locationId=${encodeURIComponent(agency.locationId)}`,
    );
    const pipelines = (res.pipelines ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      stages: (p.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
    }));

    const board = pickColdCallPipeline(pipelines, LEAD_STATUSES);
    if (!board) {
      return Response.json({ configured: true, noPipeline: true, added: 0, leads: [] });
    }
    pipelineName = board.name;
    stageNameById = new Map(board.stages.map((s) => [s.id, s.name]));

    // EVERY card on the board, not the first page of them.
    //
    // This used to ask for one page of 100 on the reasoning that 100 was "far
    // more than this board holds". That stopped being true the first time a real
    // batch went out: 200 prospects were sent from the Leads tab, GoHighLevel
    // created 200 opportunities, and the sync could only ever see half of them.
    // The failure was silent in the worst way, because a truncated page looks
    // exactly like a board that has finished.
    //
    // Paged on `startAfterId` + `startAfter`, which is GHL's own cursor. The
    // hard page cap is a runaway guard, not an expectation: it is logged rather
    // than passed over, because a board big enough to hit it is a board this
    // sync is now lying about.
    cards = [];
    let startAfterId: string | undefined;
    let startAfter: number | undefined;
    for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
      const cursor =
        startAfterId && startAfter !== undefined
          ? `&startAfterId=${encodeURIComponent(startAfterId)}&startAfter=${startAfter}`
          : "";
      const opps = await ghlJson<{ opportunities?: RawOpportunity[] }>(
        agency,
        `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
          `&pipeline_id=${encodeURIComponent(board.id)}&limit=${PAGE_SIZE}${cursor}`,
      );
      const batch = opps.opportunities ?? [];
      cards.push(...batch);
      // A short page is the last page. Equally, a cursor we cannot build means
      // stopping here rather than looping on the same 100 for ever.
      if (batch.length < PAGE_SIZE) break;
      const last = batch[batch.length - 1];
      const sortStamp = Date.parse(last.updatedAt ?? last.createdAt ?? "");
      if (!last.id || Number.isNaN(sortStamp)) break;
      startAfterId = last.id;
      startAfter = sortStamp;
    }
    if (cards.length >= PAGE_SIZE * MAX_SYNC_PAGES) {
      console.warn(
        `[leads/sync-ghl] hit the ${PAGE_SIZE * MAX_SYNC_PAGES} card ceiling on "${board.name}"; some prospects were not read`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not reach GoHighLevel";
    return Response.json({ error: message.slice(0, 300) }, { status: 502 });
  }

  // The board's prospects already in the book, including the soft-deleted: a
  // prospect Jake threw away is not one to quietly re-add on the next sync.
  //
  // Looked up by the cards' own contact ids and phones, never by reading the
  // whole book: PostgREST returns at most 1,000 rows, the book passed 18,000,
  // and every prospect past the first thousand was inserted again on each open
  // of Cold Call (2,000 contacts duplicated, one 47 times; 2026-10-01).
  // Phones only for the cards no contact id matched, which keeps the requests
  // to a handful.
  const existingRows: ExistingLead[] = [];
  try {
    const { contactIds } = existingLookupKeys(cards);
    existingRows.push(...(await readExisting(client, "ghl_contact_id", contactIds)));
    const matched = new Set(existingRows.map((r) => r.ghl_contact_id).filter(Boolean));
    const unmatched = cards.filter((raw) => !matched.has(raw.contact?.id ?? ""));
    existingRows.push(...(await readExisting(client, "phone", existingLookupKeys(unmatched).phones)));
  } catch (err) {
    const code = (err as { code?: string }).code;
    const detail =
      code === UNDEFINED_COLUMN
        ? "The lead book is missing its GoHighLevel link columns (migration 0053). Run the migrations before syncing."
        : (err as Error).message;
    return Response.json({ error: detail }, { status: 500 });
  }

  const plan = planLeadSync(
    cards,
    stageNameById,
    LEAD_STATUSES,
    existingRows,
    new Date().toISOString(),
  );

  if (!plan.insert.length) {
    return Response.json({
      configured: true,
      pipeline: pipelineName,
      added: 0,
      leads: [],
      skippedExisting: plan.skippedExisting,
      skippedNoPhone: plan.skippedNoPhone,
      skippedStages: plan.skippedStages,
    });
  }

  const { data, error } = await client.from("leads").insert(plan.insert).select(SELECT);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const leads = ((data ?? []) as never[]).map(toLead);
  await logAdminAction(client, admin.id, "leads.sync_ghl", null, {
    pipeline: pipelineName,
    added: leads.length,
    skippedExisting: plan.skippedExisting,
  });

  return Response.json({
    configured: true,
    pipeline: pipelineName,
    added: leads.length,
    leads,
    skippedExisting: plan.skippedExisting,
    skippedNoPhone: plan.skippedNoPhone,
    skippedStages: plan.skippedStages,
  });
};

// Leads whose column matches any of the values, in batches small enough for a
// URL (300 values is about 6 KB) and few enough to stay well inside the 50
// subrequest cap beside the 20 GoHighLevel pages. Throws the PostgREST error so
// the caller can name a missing column.
const LOOKUP_BATCH = 300;

async function readExisting(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  column: "ghl_contact_id" | "phone",
  values: string[],
): Promise<ExistingLead[]> {
  const out: ExistingLead[] = [];
  for (let i = 0; i < values.length; i += LOOKUP_BATCH) {
    const { data, error } = await client
      .from("leads")
      .select("phone, ghl_contact_id")
      .in(column, values.slice(i, i + LOOKUP_BATCH));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    out.push(...((data ?? []) as ExistingLead[]));
  }
  return out;
}
