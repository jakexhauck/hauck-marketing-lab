import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { EXPORT_THRESHOLD, partitionForSend, toCsv } from "../../../lib/leadScraper";
import { toScrapedLead } from "./index";

// GET /api/admin/leads/export -> the SOP's CSV, for anything Jake wants to import
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
  "id, business_name, phone_e164, city, state, website, rating, review_count, icp_score, icp_flags, send_status, sent_to";

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
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const runId = url.searchParams.get("runId");
  const dryRun = url.searchParams.get("dryRun") === "1";

  let query = client
    .from("cold_sms_outreach_numbers")
    .select(EXPORT_SELECT)
    .eq("in_crm", false)
    .eq("send_status", "pending")
    .gte("icp_score", EXPORT_THRESHOLD);

  if (runId) query = query.eq("run_id", runId);

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
