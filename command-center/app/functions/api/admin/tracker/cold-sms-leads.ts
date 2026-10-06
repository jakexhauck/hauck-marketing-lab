import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  normalizeFilters,
  type ColdSmsLead,
  type ColdSmsLeadBatch,
  type ColdSmsLeadGroup,
} from "../../../../src/lib/coldSmsLeads";

// Cold SMS > Leads (0139). Leads arrive from cold-sms-pipeline's `upload`;
// this route only reads. Taking leads lives in cold-sms-leads-export.ts.
// Agency-global, owner only (no role rule opens it).

const PAGE = 1000;
const PREVIEW = 100;

interface LeadRow {
  phone: string;
  company_name: string;
  city: string;
  state: string;
  timezone: string | null;
  website: string | null;
  service: string;
  line_type: string;
  trade: string;
  export_batch: string | null;
  exported_at: string | null;
}

export function toLead(r: LeadRow): ColdSmsLead {
  return {
    phone: r.phone,
    companyName: r.company_name,
    city: r.city,
    state: r.state,
    timezone: r.timezone,
    website: r.website,
    service: r.service,
    lineType: r.line_type,
    trade: r.trade,
    exportBatch: r.export_batch,
    exportedAt: r.exported_at,
  };
}

// cold_sms_leads_pick: the preview (batch null) and the take (batch set) are
// one query, so the file is always the list that was on screen.
export async function pick(
  client: SupabaseClient,
  body: Record<string, unknown>,
  limit: number,
  batch: string | null,
) {
  const f = normalizeFilters(body);
  const { data, error } = await client.rpc("cold_sms_leads_pick", {
    p_cities: f.cities,
    p_line_types: f.lineTypes,
    p_services: f.services,
    p_limit: limit,
    p_batch: batch,
  });
  if (error) return { error: error.message, leads: [] as ColdSmsLead[] };
  return { error: null, leads: ((data ?? []) as LeadRow[]).map(toLead) };
}

// The groups view is one row per city x line type x service, which passes
// 1000 once the other states land. PostgREST cuts every read at 1000 without
// saying so, so page until a short page comes back.
async function allGroups(client: SupabaseClient) {
  const rows: ColdSmsLeadGroup[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("cold_sms_lead_groups")
      .select("city, state, line_type, service, available")
      .order("state")
      .order("city")
      .order("line_type")
      .order("service")
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message, rows };
    for (const g of data ?? []) {
      rows.push({
        city: g.city,
        state: g.state,
        lineType: g.line_type,
        service: g.service,
        available: g.available,
      });
    }
    if ((data ?? []).length < PAGE) return { error: null, rows };
  }
}

// GET: every available group (the page counts from these) and every download.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const [groups, batches] = await Promise.all([
    allGroups(client),
    client
      .from("cold_sms_lead_batches")
      .select("batch, exported_at, leads")
      .order("exported_at", { ascending: false })
      .limit(200),
  ]);
  if (groups.error) return Response.json({ error: groups.error }, { status: 500 });
  if (batches.error) return Response.json({ error: batches.error.message }, { status: 500 });

  return Response.json({
    groups: groups.rows,
    batches: (batches.data ?? []).map(
      (b): ColdSmsLeadBatch => ({ batch: b.batch, exportedAt: b.exported_at, leads: b.leads }),
    ),
  });
};

// POST { cities, lineTypes, services, limit }: the first leads the download
// would take, at most PREVIEW of them. Read only.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const want = normalizeFilters(body).limit;
  const result = await pick(client, body, want > 0 ? Math.min(want, PREVIEW) : PREVIEW, null);
  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ rows: result.leads });
};
