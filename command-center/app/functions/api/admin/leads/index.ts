import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  CALLABLE_LEAD_FILTER,
  explainFlags,
  scoreBand,
  type ScrapedLead,
} from "../../../lib/leadScraper";
import { IMPORT_SOURCE } from "./import";
import { areaCodesForZone, isCallZone } from "../../../lib/leadZones";

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

// The Sent to dialer tab, and the exact inverse of the last condition in
// CALLABLE_LEAD_FILTER: not a duplicate, a mobile, and handed to Cold Call.
// `send_status` is a pattern rather than a value here, so it is applied as a
// LIKE below rather than living in this match.
const ON_THE_DIALER_FILTER = {
  in_crm: false,
  line_type: "wireless",
  sent_to: "cold_call",
} as const;

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
  // An IANA zone, or absent for every timezone. Checked against the four the
  // filter offers rather than taken as given: this becomes an IN list built from
  // a map, and an unknown zone would silently build an empty one, which reads on
  // screen as "there are no leads" rather than as "that is not a zone".
  const zoneParam = url.searchParams.get("zone");
  const zone = isCallZone(zoneParam) ? (zoneParam as string) : null;
  // "1" = the Sent to dialer tab: the companies sitting in GoHighLevel's manual
  // actions queue that nobody has rung yet, so they can be taken back off.
  const dialer = url.searchParams.get("dialer") === "1";
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
    //
    // Unless this is the Sent to dialer tab, which is the one view that exists
    // to show exactly those: the companies queued over there, so they can be
    // taken back off. See ON_THE_DIALER_FILTER.
    .match(dialer ? ON_THE_DIALER_FILTER : CALLABLE_LEAD_FILTER);

  // The stamp itself, which the filter above cannot carry because it is a
  // pattern rather than a value. `_` is a single-character wildcard in LIKE, so
  // this is deliberately loose; wentToTheDialer() checks it exactly below.
  if (dialer) query = query.like("send_status", "cold_call_%queued%");

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
  // The timezone the number is in, matched on the generated area_code column
  // (0118). Done here rather than in the browser because the browser only ever
  // holds one page of the list: filtering there would drop the tail and report a
  // total that did not match what it had filtered.
  if (zone) query = query.in("area_code", areaCodesForZone(zone));
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

  const rows = (data ?? []) as LeadRow[];

  if (dialer) {
    // Only the ones nobody has rung (Jake, 2026-08-24). A company that has been
    // called is a fact, and offering it back to the pool would put it up to be
    // sent and dialled a second time as though the first had not happened.
    //
    // Filtered here rather than in the query because the two facts live in
    // unrelated tables with no key between them: the book is joined to this one
    // on the PHONE NUMBER, which is the only thing send.ts ever wrote into both.
    // So `total` is the count AFTER this filter and not the count the database
    // reported, because the number under the tab has to be the number of rows
    // above it.
    const undialed = await onlyUndialed(client, rows);
    if (!undialed) {
      return Response.json(
        { error: "could not check which of these have been called" },
        { status: 503 },
      );
    }
    return Response.json({
      leads: undialed.map(shape),
      total: undialed.length,
      offset,
      limit,
    });
  }

  return Response.json({
    leads: rows.map(shape),
    total: count ?? 0,
    offset,
    limit,
  });
};

/**
 * The rows whose company has no call logged against it.
 *
 * Two reads: the book rows for these phone numbers, and the dials against those
 * book rows. Null when either could not run, because supabase-js RESOLVES a
 * failed read with `{ data: null, error }` and reading `data` alone would turn a
 * database blip into "nobody has been called", which is the direction that gets
 * a company rung twice.
 *
 * A company with no book row at all is kept: it is stamped as sent to the dialer
 * and has no dial against it, which is exactly the state this tab is for.
 */
async function onlyUndialed(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  rows: LeadRow[],
): Promise<LeadRow[] | null> {
  if (rows.length === 0) return rows;

  const phones = [...new Set(rows.map((r) => r.phone_e164).filter(Boolean))];
  const { data: bookRows, error: bookError } = await client
    .from("leads")
    .select("id, phone")
    .is("deleted_at", null)
    .in("phone", phones.length > 0 ? phones : ["-"]);
  if (bookError) {
    console.error("[leads] book read failed", bookError.message);
    return null;
  }

  const book = (bookRows ?? []) as { id: string; phone: string | null }[];
  if (book.length === 0) return rows;

  const { data: dialRows, error: dialError } = await client
    .from("cold_call_dials")
    .select("lead_id")
    .in(
      "lead_id",
      book.map((b) => b.id),
    );
  if (dialError) {
    console.error("[leads] dial read failed", dialError.message);
    return null;
  }

  const dialedBookIds = new Set(
    ((dialRows ?? []) as { lead_id: string | null }[]).map((d) => d.lead_id).filter(Boolean),
  );
  const dialedPhones = new Set(
    book.filter((b) => dialedBookIds.has(b.id)).map((b) => (b.phone ?? "").trim()),
  );

  return rows.filter((r) => !dialedPhones.has(r.phone_e164));
}
