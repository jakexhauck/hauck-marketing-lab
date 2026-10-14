import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { batchDay, batchLabel, leadsCsv, normalizeFilters } from "../../../../src/lib/coldSmsLeads";
import { pick, toLead } from "./cold-sms-leads";

// Cold SMS > Leads, the download (0139).
//
// POST takes leads: it stamps them with a new batch and hands back the GHL
// import CSV. Stamp and read are one database call (cold_sms_leads_pick), so a
// lead is never in a file without being marked, and never in two files. A POST
// because it changes data: a GET would let a prefetch burn a batch (the
// lesson from leads/export.ts).
//
// GET ?batch= re-downloads a past batch. Read only, changes nothing.

function csvResponse(body: string, batch: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${batch}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const filters = normalizeFilters(body);
  if (filters.limit < 1) return Response.json({ error: "How many?" }, { status: 400 });

  const batch = batchLabel(new Date());
  const result = await pick(client, body, filters.limit, batch);
  if (result.error) {
    console.error("[cold-sms-leads/export] take failed", result.error);
    return Response.json({ error: "Could not build the file." }, { status: 500 });
  }
  if (result.leads.length === 0) {
    return Response.json({ error: "No leads match." }, { status: 404 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_sms_leads.export", null, {
    batch,
    rows: result.leads.length,
    ...filters,
  });

  return csvResponse(leadsCsv(result.leads, batchDay(batch)), batch);
};

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const batch = new URL(ctx.request.url).searchParams.get("batch") ?? "";
  if (!batch) return Response.json({ error: "batch required" }, { status: 400 });

  // jsonb from an RPC, so a batch over 1000 leads comes back whole.
  const { data, error } = await client.rpc("cold_sms_leads_in_batch", { p_batch: batch });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const leads = ((data ?? []) as Parameters<typeof toLead>[0][]).map(toLead);
  if (leads.length === 0) return Response.json({ error: "No such batch." }, { status: 404 });

  return csvResponse(leadsCsv(leads, batchDay(batch)), batch);
};
