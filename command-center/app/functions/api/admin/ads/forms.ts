import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  LEAD_FORM_SELECT,
  toLeadForm,
  type LeadFormRow,
} from "../../../lib/adLeadForms";

// Lead form drafts: list and create (0090).
//
//   GET  /api/admin/ads/forms?tenantId=...  -> { forms: [...] }  newest first
//   POST /api/admin/ads/forms { tenantId }  -> { form }          empty, named later
//
// Admin-only: gated centrally in api/_middleware.ts. Never client-reachable.
// Nothing here reaches Meta; these are drafts that end up on a clipboard.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const { data, error } = await client
    .from("ad_lead_forms")
    .select(LEAD_FORM_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const forms = ((data ?? []) as unknown as LeadFormRow[]).map(toLeadForm);
  return Response.json({ forms });
};

interface CreateBody {
  tenantId?: string;
}

// Creating a form takes no content, same as a batch: pressing New puts an open
// empty form on the page and the writing happens in it.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const tenantId = (body.tenantId ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const { data, error } = await client
    .from("ad_lead_forms")
    .insert({ tenant_id: tenantId })
    .select(LEAD_FORM_SELECT)
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "could not create form" },
      { status: 500 },
    );
  }

  return Response.json({ form: toLeadForm(data as unknown as LeadFormRow) }, { status: 201 });
};
