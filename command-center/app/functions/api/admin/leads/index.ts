import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  explainFlags,
  scoreBand,
  EXPORT_THRESHOLD,
  type ScrapedLead,
} from "../../../lib/leadScraper";

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
  "id, business_name, phone_e164, city, state, website, rating, review_count, icp_score, icp_flags, send_status, sent_to, sent_at, primary_type, metro, source, source_keyword, niche_id, run_id, created_at";

const PAGE_MAX = 500;

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
  const search = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, PAGE_MAX);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  let query = client
    .from("cold_sms_outreach_numbers")
    .select(SELECT, { count: "exact" })
    // The duplicate rule, applied in one place.
    .eq("in_crm", false);

  if (runId) query = query.eq("run_id", runId);
  if (nicheId) query = query.eq("niche_id", nicheId);
  if (sent === "1") query = query.neq("send_status", "pending");
  if (sent === "0") {
    // "Not sent yet" means SENDABLE, not merely unstamped. The send applies the
    // SOP's floor and refuses anything under the threshold or without a business
    // name, and those two facts do not change on their own: a lead the send will
    // always refuse used to sit here forever, offering itself to be ticked again
    // every day. It is filtered rather than stamped because a re-scrape CAN lift
    // a score (pipeline.py enriches in place and deliberately never writes
    // send_status), and a stamped row would never be offered again. Filtering
    // corrects itself the moment the score does. Everything still shows them.
    query = query
      .eq("send_status", "pending")
      .gte("icp_score", EXPORT_THRESHOLD)
      .not("business_name", "is", null)
      .neq("business_name", "");
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
