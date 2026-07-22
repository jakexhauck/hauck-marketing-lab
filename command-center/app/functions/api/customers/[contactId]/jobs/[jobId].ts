import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../../lib/supabase";
import { validateJobFields } from "../../../../lib/customerJobs";

// PUT / DELETE /api/customers/:contactId/jobs/:jobId — fix or remove a logged job.
//
// These numbers drive the client's revenue tiles, and a fat-fingered $42,000
// would otherwise live there forever (or need me in the database). Every query
// is scoped by BOTH tenant_id and ghl_contact_id as well as the job id, so a
// guessed uuid from one tenant can never touch another's row.

interface EditJobBody {
  description: string;
  valueCents: number;
  completedOn: string;
}

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const contactId = ctx.params.contactId as string;
  const jobId = ctx.params.jobId as string;
  const body = await readJsonBody<EditJobBody>(ctx.request);

  const fields = {
    description: body?.description ?? "",
    valueCents: body?.valueCents ?? Number.NaN,
    completedOn: body?.completedOn ?? "",
  };
  const invalid = validateJobFields(fields, new Date());
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, ctx.data.tenant.slug) : null;
  if (!client || !tenantId) {
    return Response.json({ error: "jobs_unavailable" }, { status: 503 });
  }

  const { data, error } = await client
    .from("customer_jobs")
    .update({
      description: fields.description.trim(),
      value_cents: fields.valueCents,
      completed_on: fields.completedOn,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("ghl_contact_id", contactId)
    .eq("id", jobId)
    .select("id");

  if (error) return Response.json({ error: "not_saved" }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const contactId = ctx.params.contactId as string;
  const jobId = ctx.params.jobId as string;

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, ctx.data.tenant.slug) : null;
  if (!client || !tenantId) {
    return Response.json({ error: "jobs_unavailable" }, { status: 503 });
  }

  // Deleting the row also clears its close-out ledger entry, so if this job came
  // from a board card that card becomes eligible for close-out again. That is
  // correct: the record of the work is gone, so the work is unrecorded again.
  const { data, error } = await client
    .from("customer_jobs")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("ghl_contact_id", contactId)
    .eq("id", jobId)
    .select("id");

  if (error) return Response.json({ error: "not_deleted" }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
};
