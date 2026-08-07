import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import {
  LEAD_FORM_SELECT,
  formPatchColumns,
  toLeadForm,
  type LeadFormPatch,
  type LeadFormRow,
} from "../../../../lib/adLeadForms";

// One lead form draft (0090).
//
//   PATCH  /api/admin/ads/forms/:formId   { any subset of the fields }
//   DELETE /api/admin/ads/forms/:formId
//
// The editor saves a block when it is left, so a PATCH normally carries one
// key. Only the keys present are written; an absent key is untouched.
//
// Deleting is safe for the copy that pointed at it: ad_batches.form_id is
// ON DELETE SET NULL, so a round of ads outlives the form it fed.
//
// Admin-only: gated centrally in api/_middleware.ts.

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const formId = ctx.params.formId as string;

  let body: LeadFormPatch = {};
  try {
    body = (await ctx.request.json()) as LeadFormPatch;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update = formPatchColumns(body);
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from("ad_lead_forms")
    .update(update)
    .eq("id", formId)
    .select(LEAD_FORM_SELECT)
    .single();

  if (error || !data) {
    return Response.json({ error: error?.message ?? "form not found" }, { status: 404 });
  }

  return Response.json({ form: toLeadForm(data as unknown as LeadFormRow) });
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const formId = ctx.params.formId as string;
  const { error } = await client.from("ad_lead_forms").delete().eq("id", formId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};
