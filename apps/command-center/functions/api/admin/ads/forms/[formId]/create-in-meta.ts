import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { GRAPH } from "../../../../../lib/metaGraph";
import { resolveMetaToken } from "../../../../../lib/metaToken";
import { listReachablePages } from "../../../../../lib/metaPages";
import { nextFormName, toMetaPayload } from "../../../../../lib/metaLeadForm";
import { LEAD_FORM_SELECT, toLeadForm, type LeadFormRow } from "../../../../../lib/adLeadForms";

// POST /api/admin/ads/forms/:formId/create-in-meta
//
// Builds the drafted Instant Form on the client's Facebook Page
// (functions/lib/metaLeadForm.ts maps it; the shape was proven on Willis's
// Page). Meta refuses a repeated form name, so a taken name is retried as
// "Name (2)", "Name (3)". On success the draft is stamped with the Meta form id
// and becomes read only. Answers with what Meta could not take, for Jake to set
// by hand in Ads Manager. Owner only.

const NAME_TAKEN = 1892019;

export const onRequestPost: PagesFunction<Env, "formId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (!admin || admin.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const formId = ctx.params.formId as string;

  const { data: row, error } = await client.from("ad_lead_forms").select(LEAD_FORM_SELECT).eq("id", formId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row) return Response.json({ error: "Form not found" }, { status: 404 });
  const form = toLeadForm(row as unknown as LeadFormRow);
  if (form.metaFormId) return Response.json({ error: "This form is already in Meta" }, { status: 409 });

  const { data: tenant } = await client.from("tenants").select("meta_page_id").eq("id", form.tenantId).maybeSingle();
  const pageId = (tenant as { meta_page_id?: string | null } | null)?.meta_page_id ?? "";
  if (!pageId) return Response.json({ error: "Pick the client's Facebook Page first" }, { status: 400 });

  const { body, manual, errors } = toMetaPayload(form);
  if (errors.length) return Response.json({ error: errors.join(". ") }, { status: 400 });

  const token = await resolveMetaToken(ctx.env);
  if (!token) return Response.json({ error: "Meta is not connected" }, { status: 400 });
  let pageToken: string | undefined;
  try {
    pageToken = (await listReachablePages(token)).find((p) => p.id === pageId)?.accessToken;
  } catch (err) {
    return Response.json({ error: `Meta: ${(err as Error).message}` }, { status: 502 });
  }
  if (!pageToken) {
    return Response.json(
      { error: "The agency's Meta system user cannot reach this Page. Give it access in Business Settings." },
      { status: 400 },
    );
  }

  let name = String(body.name);
  let created: { id?: string; error?: { message?: string; error_subcode?: number; error_user_msg?: string } } = {};
  for (let attempt = 0; attempt < 5; attempt++) {
    const params = new URLSearchParams({ access_token: pageToken });
    for (const [k, v] of Object.entries({ ...body, name })) {
      params.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    const res = await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/leadgen_forms`, { method: "POST", body: params });
    created = (await res.json().catch(() => ({}))) as typeof created;
    if (created.error?.error_subcode === NAME_TAKEN) {
      name = nextFormName(name);
      continue;
    }
    break;
  }
  if (!created.id) {
    const msg = created.error?.error_user_msg || created.error?.message || "Meta did not create the form";
    return Response.json({ error: `Meta: ${msg}` }, { status: 502 });
  }

  const { data: saved, error: saveErr } = await client
    .from("ad_lead_forms")
    .update({
      meta_form_id: created.id,
      meta_form_name: name,
      meta_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", formId)
    .select(LEAD_FORM_SELECT)
    .single();
  await logAdminAction(client, admin.id, "ads.lead-form.create-in-meta", form.tenantId, {
    formId,
    metaFormId: created.id,
    name,
  });
  if (saveErr || !saved) {
    // The form IS in Meta; say so rather than inviting a second create.
    return Response.json(
      { error: `Created in Meta (id ${created.id}) but not saved here: ${saveErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  return Response.json({ form: toLeadForm(saved as unknown as LeadFormRow), manual, metaName: name });
};
