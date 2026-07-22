import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../../lib/supabase";
import { validateJobFields } from "../../../../lib/customerJobs";

// POST /api/customers/:contactId/jobs — log a job by hand.
//
// Two real reasons this exists, both from the spec's scenario matrix:
//   - Backfill: a customer who predates the app reads $0 until someone records
//     the work they actually paid for.
//   - Recovery: if the close-out moved the opportunity but the job insert failed
//     (see the ordering note in api/sales/close-outs/index.ts), this is how a
//     human repairs it without anyone touching the database.
//
// source_opportunity_id is deliberately NULL here: this job was not closed out
// from a board card, and the partial unique index only constrains non-null ids,
// so hand-added jobs never collide with each other.

interface AddJobBody {
  description: string;
  valueCents: number;
  completedOn: string;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const contactId = ctx.params.contactId as string;
  const body = await readJsonBody<AddJobBody>(ctx.request);

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
    .insert({
      tenant_id: tenantId,
      ghl_contact_id: contactId,
      description: fields.description.trim(),
      value_cents: fields.valueCents,
      completed_on: fields.completedOn,
      source_opportunity_id: null,
      created_by: ctx.data.staff?.id ? `staff:${ctx.data.staff.id}` : "owner",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[customer jobs] insert failed", error);
    return Response.json({ error: "not_saved" }, { status: 500 });
  }
  return Response.json({ ok: true, id: (data as { id: string }).id });
};
