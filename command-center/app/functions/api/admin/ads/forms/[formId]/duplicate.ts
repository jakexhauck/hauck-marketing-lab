import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { LEAD_FORM_SELECT, toLeadForm, type LeadFormRow } from "../../../../../lib/adLeadForms";

// POST /api/admin/ads/forms/:formId/duplicate
// A new, editable draft with everything the original had, minus its Meta stamp.
// How a form already in Meta gets its next version (Meta cannot edit a form).
export const onRequestPost: PagesFunction<Env, "formId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client.from("ad_lead_forms").select("*").eq("id", ctx.params.formId as string).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Form not found" }, { status: 404 });

  const copy: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const k of ["id", "created_at", "updated_at", "meta_form_id", "meta_form_name", "meta_created_at"]) delete copy[k];
  copy.name = `${String(copy.name ?? "").trim() || "Untitled form"} (copy)`.slice(0, 120);

  const { data: made, error: insErr } = await client.from("ad_lead_forms").insert(copy).select(LEAD_FORM_SELECT).single();
  if (insErr || !made) return Response.json({ error: insErr?.message ?? "could not duplicate" }, { status: 500 });
  return Response.json({ form: toLeadForm(made as unknown as LeadFormRow) }, { status: 201 });
};
