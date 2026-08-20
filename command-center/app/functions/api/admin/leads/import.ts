import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { toE164 } from "../../../lib/agencyCrm";

// POST /api/admin/leads/import -> take a CSV an external scraper produced and put
// its rows in the same table our own scraper writes to.
//
// The one place external lists enter. They land beside the scraped leads rather
// than in a table of their own, so one send path, one duplicate rule and one
// mobile check cover both, and "send to power dialer" needs no second version of
// itself. source = IMPORT_SOURCE is what separates the two on screen.
//
// Deliberately NOT scored. An icp_score is what our qualifier thought of a
// business it found; a row from somebody else's file has no such history, and
// inventing one would put a number next to a name that nothing stands behind.
// Scoring stopped gating sends, so an unscored row sends perfectly well.
//
// Two rules, both borrowed from the existing importer because both protect the
// caller's day:
//   1. No phone number, no row. This is a dialing list.
//   2. A number already in the table is skipped, not duplicated, and the response
//      says how many. Importing the same file twice is a thing people do.
//
// line_type is not set here on purpose: cold_sms_set_line_type stamps it from the
// NANPA block map on insert, so an imported number answers the mobile question
// the same way a scraped one does, by the same map, without this endpoint
// knowing the map exists.

export const IMPORT_SOURCE = "csv_import";

// Enough to be worth dialing, small enough that one request stays honest.
const MAX_ROWS = 5000;

interface ImportRow {
  phone?: unknown;
  businessName?: unknown;
  city?: unknown;
  state?: unknown;
  website?: unknown;
  niche?: unknown;
}

interface PostBody {
  rows?: unknown;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const raw = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : null;
  if (!raw) return Response.json({ error: "rows must be a list" }, { status: 400 });
  if (raw.length === 0) {
    return Response.json({ error: "That file had no rows in it." }, { status: 400 });
  }
  if (raw.length > MAX_ROWS) {
    return Response.json(
      { error: `That file has ${raw.length} rows. Split it: ${MAX_ROWS} is the most in one go.` },
      { status: 400 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  // Deduplicate inside the file as well as against the table. A file that lists
  // one business twice would otherwise make the upsert argue with itself.
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  let noPhone = 0;
  let duplicateInFile = 0;

  for (const row of raw) {
    const phoneRaw = typeof row.phone === "string" ? row.phone : "";
    const e164 = toE164(phoneRaw);
    if (!e164) {
      noPhone += 1;
      continue;
    }
    if (seen.has(e164)) {
      duplicateInFile += 1;
      continue;
    }
    seen.add(e164);
    rows.push({
      phone_e164: e164,
      phone_raw: text(phoneRaw, 40),
      business_name: text(row.businessName),
      city: text(row.city, 80),
      state: text(row.state, 40),
      website: text(row.website, 300),
      niche_id: text(row.niche, 60),
      source: IMPORT_SOURCE,
      send_status: "pending",
      in_crm: false,
      sourced_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return Response.json(
      { error: `None of those ${raw.length} rows had a usable phone number.` },
      { status: 400 },
    );
  }

  // Which of these numbers the table already holds, asked BEFORE the write so the
  // report can distinguish "added" from "already had it". The upsert would happily
  // do both silently and leave the count meaningless.
  const existing = new Set<string>();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => r.phone_e164 as string);
    const { data } = await client
      .from("cold_sms_outreach_numbers")
      .select("phone_e164")
      .in("phone_e164", chunk);
    for (const r of (data ?? []) as { phone_e164: string }[]) existing.add(r.phone_e164);
  }

  const fresh = rows.filter((r) => !existing.has(r.phone_e164 as string));

  let imported = 0;
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    const { error } = await client.from("cold_sms_outreach_numbers").insert(chunk);
    if (error) {
      console.error("[leads/import] insert failed", error.message);
      return Response.json(
        {
          error: "Some rows could not be saved.",
          imported,
          alreadyHad: existing.size,
          noPhone,
          duplicateInFile,
        },
        { status: 500 },
      );
    }
    imported += chunk.length;
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.import", null, {
    imported,
    alreadyHad: existing.size,
    noPhone,
  });

  return Response.json({
    imported,
    alreadyHad: existing.size,
    noPhone,
    duplicateInFile,
    received: raw.length,
  });
};
