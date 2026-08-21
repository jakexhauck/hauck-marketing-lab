import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  CALLABLE_LEAD_FILTER,
  explainFlags,
  scoreBand,
  type ScrapedLead,
} from "../../../lib/leadScraper";
import { IMPORT_SOURCE } from "./import";

// GET /api/admin/leads -> the scraped leads table, best score first.
//
// Rows the scraper marked in_crm are never returned. Jake asked for duplicates to
// be hidden entirely, and hiding them here rather than dropping them at write time
// means the overlap stays countable (the run history reports it) without ever
// cluttering the working list.
//
// Nothing on this page is derived and stored. The score and its reasons come
// straight from icp_score / icp_flags as the SOP's qualifier wrote them, so what
// you read here is exactly what the engine decided.

// One literal, not a concatenation: supabase-js infers the row type from this
// string, and a joined expression collapses it to an error type.
const SELECT =
  "id, business_name, phone_e164, city, state, website, rating, review_count, icp_score, icp_flags, send_status, sent_to, line_type, sent_at, primary_type, metro, source, source_keyword, niche_id, run_id, created_at";

// Raised from 500 on 21 August. The page never asked for a second page, so the
// cap was not a page size, it was the end of the list: 249 leads were waiting and
// 49 of them could not be reached by any control on the screen.
const PAGE_MAX = 1000;

interface LeadRow {
  id: string;
  business_name: string | null;
  phone_e164: string;
  city: string | null;
  state: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  icp_score: number | null;
  icp_flags: string[] | null;
  send_status: string;
  sent_to: string | null;
  line_type: string | null;
  sent_at: string | null;
  primary_type: string | null;
  metro: string | null;
  source: string | null;
  source_keyword: string | null;
  niche_id: string | null;
  run_id: string | null;
  created_at: string;
}

export function toScrapedLead(row: LeadRow): ScrapedLead {
  return {
    id: row.id,
    businessName: row.business_name,
    phoneE164: row.phone_e164,
    city: row.city,
    state: row.state,
    website: row.website,
    rating: row.rating,
    reviewCount: row.review_count,
    icpScore: row.icp_score,
    icpFlags: row.icp_flags ?? [],
    sendStatus: row.send_status,
    sentTo: row.sent_to,
    lineType: row.line_type,
  };
}

function shape(row: LeadRow) {
  const flags = row.icp_flags ?? [];
  return {
    ...toScrapedLead(row),
    // The two things Jake reads to decide: the number, and why it is that number.
    scoreBand: scoreBand(row.icp_score),
    reasons: explainFlags(flags),
    category: row.primary_type,
    metro: row.metro,
    source: row.source,
    sourceKeyword: row.source_keyword,
    nicheId: row.niche_id,
    runId: row.run_id,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const runId = url.searchParams.get("runId");
  const nicheId = url.searchParams.get("nicheId");
  const sent = url.searchParams.get("sent"); // "1" sent, "0" not yet, absent = both
  const imported = url.searchParams.get("imported"); // "1" CSV, "0" scraped, absent = both
  const search = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, PAGE_MAX);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  let query = client
    .from("cold_sms_outreach_numbers")
    .select(SELECT, { count: "exact" })
    // Not a duplicate, a mobile, and not yet sent. The three together are what
    // "a lead I can call" means, and they live in CALLABLE_LEAD_FILTER so the
    // count shown against a run is counted the same way this list is built.
    //
    // A landline is never shown, on any tab, under any filter. It cannot be sent
    // (partitionForSend refuses it) and it cannot be dialled, so listing one only
    // ever offered work that could not be done and made every count read higher
    // than the number of leads actually there. Jake's call, 21 August 2026: do
    // not show them, delete them. scripts/purge-landline-leads.mjs does the
    // deleting; this makes sure a re-scrape cannot put them back on screen.
    //
    // A lead that has gone to the power dialer is finished with this screen. It
    // cannot be sent again, so leaving it in only offered work already done.
    .match(CALLABLE_LEAD_FILTER);

  if (runId) query = query.eq("run_id", runId);
  if (nicheId) query = query.eq("niche_id", nicheId);
  // Imported rows live in this table beside the scraped ones so they share the
  // send path, and are told apart only here: "imported" is the Import leads page,
  // "scraped" is Leads. Absent means both, which is what the send and the export
  // still see, because where a number came from does not change how it is dialled.
  if (imported === "1") query = query.eq("source", IMPORT_SOURCE);
  if (imported === "0") query = query.or(`source.is.null,source.neq.${IMPORT_SOURCE}`);
  if (sent === "0") {
    // Ready to send narrows the remaining rows to the ones a send will accept.
    // The mobile half of that rule moved into the base query, because it is now
    // true of every tab rather than of this filter. What is left is the name.
    // Filtered rather than stamped because a re-scrape CAN change it (pipeline.py
    // enriches in place and deliberately never writes send_status), so this
    // corrects itself the moment the row does.
    query = query.not("business_name", "is", null).neq("business_name", "");
  }
  if (search) {
    const safe = search.replace(/[,()*]/g, " ").trim();
    if (safe) query = query.or(`business_name.ilike.%${safe}%,city.ilike.%${safe}%`);
  }

  const { data, error, count } = await query
    .order("icp_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[leads] read failed", error.message);
    return Response.json({ error: "could not read the leads" }, { status: 500 });
  }

  return Response.json({
    leads: ((data ?? []) as LeadRow[]).map(shape),
    total: count ?? 0,
    offset,
    limit,
  });
};
