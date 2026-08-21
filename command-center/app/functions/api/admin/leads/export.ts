import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { partitionForSend, toCsv } from "../../../lib/leadScraper";
import { IMPORT_SOURCE } from "./import";
import { areaCodesForZone, isCallZone } from "../../../lib/leadZones";
import { toScrapedLead } from "./index";

// POST /api/admin/leads/export -> the SOP's CSV, for anything Jake wants to import
// somewhere the app does not reach.
//
// Deliberately identical to export_sms.py: score-qualified and not-yet-sent rows
// only, best score first, re-validated, deduped, a business name required, capped
// at 1000 rows, and send_status stamped so a second download hands out nothing.
//
// It stamps by default, exactly as the SOP does. That is the property that stops
// the same number going out twice from two different doors, so the button says so
// out loud rather than surprising anyone. ?dryRun=1 is the SOP's --dry-run: you get
// the file, nothing is marked.

const BATCH_SIZE = 1000;
const SERIES = "cold_sms_v2_batch";

// One literal, not a concatenation: supabase-js infers the row type from this
// string, and a joined expression collapses it to an error type.
const EXPORT_SELECT =
  "id, business_name, phone_e164, city, state, website, rating, review_count, icp_score, icp_flags, send_status, sent_to, line_type";

interface ExportRow {
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
}

// A POST, not a GET, since 21 August 2026.
//
// This route MARKS ROWS AS SENT and then hands back the file. That is the right
// order (a file that reached Jake without its rows being marked is how a number
// goes out twice), but it made a GET that permanently changes data, and it was
// wired to a plain link. A browser prefetch, a second click, a bookmark or a
// crawler would each have burned a batch of leads with nothing pressed on
// purpose. The button posts and saves the blob instead.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const runId = url.searchParams.get("runId");
  const nicheId = url.searchParams.get("nicheId");
  const dryRun = url.searchParams.get("dryRun") === "1";
  const imported = url.searchParams.get("imported");
  const zoneParam = url.searchParams.get("zone");
  const zone = isCallZone(zoneParam) ? (zoneParam as string) : null;

  let query = client
    .from("cold_sms_outreach_numbers")
    .select(EXPORT_SELECT)
    .eq("in_crm", false)
    .eq("send_status", "pending")
    // Filtered in the query, not just in partitionForSend: the batch is capped at
    // BATCH_SIZE rows, and letting landlines fill it would cap the file at whatever
    // fraction of them happened to be mobiles.
    .eq("line_type", "wireless");

  if (runId) query = query.eq("run_id", runId);
  // The file has to match the table it was downloaded from, or a niche filter on
  // screen would quietly stamp rows from every other trade as sent.
  if (nicheId) query = query.eq("niche_id", nicheId);
  // Same reason as the niche filter above: the file must match the list on
  // screen, or downloading from Import leads would stamp every scraped lead
  // as sent too.
  if (imported === "1") query = query.eq("source", IMPORT_SOURCE);
  if (imported === "0") query = query.or(`source.is.null,source.neq.${IMPORT_SOURCE}`);
  // Same reason again: the file has to be the list that was on screen. Without
  // this, filtering to Pacific and downloading would hand over the whole country
  // and stamp all of it as sent.
  if (zone) query = query.in("area_code", areaCodesForZone(zone));

  const { data, error } = await query
    .order("icp_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[leads/export] read failed", error.message);
    return Response.json({ error: "could not build the export" }, { status: 500 });
  }

  const leads = ((data ?? []) as ExportRow[]).map((r) => toScrapedLead(r as never));
  const { sendable } = partitionForSend(leads);

  if (sendable.length === 0) {
    return Response.json(
      { error: "Nothing qualified is waiting to go out." },
      { status: 404 },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const label = `${SERIES}_${stamp}_queued`;

  // Marked before the file is handed over, which is the .part-then-promote rule
  // from the SOP: a file that reached Jake without its rows being marked is how a
  // number goes out twice.
  if (!dryRun) {
    const { error: stampErr } = await client
      .from("cold_sms_outreach_numbers")
      .update({ send_status: label, sent_to: "csv", sent_at: new Date().toISOString() })
      .in("id", sendable.map((l) => l.id));
    if (stampErr) {
      console.error("[leads/export] stamp failed", stampErr.message);
      return Response.json(
        { error: "Could not mark those rows, so the file was not written." },
        { status: 500 },
      );
    }
    await logAdminAction(client, ctx.data.admin!.id, "leads.export.csv", null, {
      rows: sendable.length,
      runId,
      nicheId,
    });
  }

  const filename = `${SERIES}_${stamp}${dryRun ? "_dryrun" : ""}.csv`;
  return new Response(toCsv(sendable), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
