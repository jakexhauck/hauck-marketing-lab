import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { writeWithClaude } from "../../../../../lib/claude";
import { factsBlock, loadClientFacts } from "../../../../../lib/clientFacts";
import { logAiRun } from "../../../../../lib/clientCopyStore";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { appMinter, resolveTenantGhl } from "../../../../../lib/ghlCreds";
import { fetchGhlNumber } from "../../../../../lib/ghlPhone";
import { sopLeadFormPatch } from "../../../../../lib/sopLeadForm";
import { formPatchColumns, LEAD_FORM_SELECT, toLeadForm, type LeadFormRow } from "../../../../../lib/adLeadForms";

// POST /api/admin/ads/forms/:formId/sop-template
//
// Fills the form with the Client Setup SOP's standard Instant Form for this
// client (functions/lib/sopLeadForm.ts). Claude writes the three ✅ lines for
// the trade; if Claude cannot, plain lines go in and the form is still filled.
// The end page's Call Now uses the sub-account's GHL number when there is one.
// Overwrites the draft; refused on a form already in Meta. Owner only.

const LINES_SYSTEM = `You write the three short ✅ lines under the headline of a Facebook lead form for a local home-service business. Each is 2 to 7 words, a plain reason to trust them (quality, process, pricing, insurance). No em dashes, no emojis, no claims you are not given (no years, awards or guarantees unless in the facts). Example for brick paving: "Licensed & insured", "Built on a compacted base to last decades", "Transparent pricing before we start".`;

const isLines = (v: unknown): v is { lines: string[] } =>
  !!v &&
  Array.isArray((v as { lines?: unknown }).lines) &&
  (v as { lines: unknown[] }).lines.length >= 3 &&
  (v as { lines: unknown[] }).lines.every((l) => typeof l === "string" && l.trim() !== "");

export const onRequestPost: PagesFunction<Env, "formId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const formId = ctx.params.formId as string;

  const { data: row, error } = await client
    .from("ad_lead_forms")
    .select("tenant_id, meta_form_id")
    .eq("id", formId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const r = row as { tenant_id?: string; meta_form_id?: string | null } | null;
  if (!r?.tenant_id) return Response.json({ error: "Form not found" }, { status: 404 });
  if (r.meta_form_id) return Response.json({ error: "This form is in Meta. Duplicate it to change it." }, { status: 409 });

  const facts = await loadClientFacts(client, r.tenant_id);
  if (!facts) return Response.json({ error: "Client not found" }, { status: 404 });

  let ghlPhone = "";
  const tenant = await loadTenantById(client, r.tenant_id);
  const creds = tenant ? await resolveTenantGhl(tenant, appMinter(client, ctx.env)) : null;
  if (creds) ghlPhone = (await fetchGhlNumber(creds)) ?? "";

  const ai = await writeWithClaude(ctx.env, {
    system: LINES_SYSTEM,
    input: `Write 3 lines for this client.\n\n${factsBlock(facts)}`,
    schema: {
      type: "object",
      properties: { lines: { type: "array", items: { type: "string" } } },
      required: ["lines"],
      additionalProperties: false,
    },
    check: isLines,
    maxTokens: 1000,
  });
  await logAiRun(client, {
    tenantId: r.tenant_id,
    kind: "lead-form.lines",
    ok: ai.ok,
    error: ai.ok ? undefined : ai.error,
    input: ai.ok ? ai.usage.input : 0,
    output: ai.ok ? ai.usage.output : 0,
  });

  const patch = sopLeadFormPatch({
    businessName: facts.businessName,
    ghlPhone,
    lines: ai.ok ? ai.data.lines : [],
  });
  const update = formPatchColumns(patch);
  update.updated_at = new Date().toISOString();
  const { data: saved, error: saveErr } = await client
    .from("ad_lead_forms")
    .update(update)
    .eq("id", formId)
    .select(LEAD_FORM_SELECT)
    .single();
  if (saveErr || !saved) return Response.json({ error: saveErr?.message ?? "could not save" }, { status: 500 });
  return Response.json({ form: toLeadForm(saved as unknown as LeadFormRow), claude: ai.ok ? null : ai.error });
};
