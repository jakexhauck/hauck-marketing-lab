import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type GhlContext,
  type GhlOpportunity,
} from "../../../lib/ghl";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveCustomersPipeline, moneyFromCents, centsFromMoney, type PipelineLike } from "../../../lib/customers";
import { resolveJobCompletedStage } from "../../../lib/closeOutQueue";

// GET /api/sales/close-outs/:opportunityId — everything the close-out page needs
// to render before anyone types: who the job was for, what it was worth, and
// whether this contact is already a customer (which changes the copy and is the
// difference between the move and the park; see functions/lib/closeOut.ts).

interface PipelinesResponse {
  pipelines: PipelineLike[];
}

export interface CloseOutPrefill {
  opportunityId: string;
  contactId: string;
  name: string;
  phone: string;
  email: string;
  valueCents: number;
  // Already a customer: the page says so plainly and still lets them pick either
  // type, because a returning one-off is a real thing.
  existingCustomer: { type: "one-time" | "recurring"; stageName: string } | null;
  // This job has already been closed out (someone else got there first, or a
  // double submit). The page refuses rather than creating a second job.
  alreadyClosedOut: boolean;
  // The tenant has no Customers pipeline: the form is disabled honestly.
  configError?: "pipeline_not_found";
}

export type CloseOutPrefillError = { error: "not_found" | "not_in_queue" };

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const opportunityId = ctx.params.opportunityId as string;

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const pipes = pipeData.pipelines ?? [];
  const queue = resolveJobCompletedStage(pipes);
  if (!queue) return Response.json({ error: "not_found" }, { status: 404 });

  const salesOpps = await fetchAllOpportunities(gctx, { pipelineId: queue.pipelineId });
  const opp = salesOpps.find((o) => o.id === opportunityId);
  if (!opp) return Response.json({ error: "not_found" }, { status: 404 });

  // Guard: only a card actually sitting in Job Completed may be closed out. A
  // hand-typed URL for a lead still in Estimate Scheduled must not create a
  // customer out of work nobody has done.
  if (opp.pipelineStageId !== queue.stageId) {
    return Response.json({ error: "not_in_queue" }, { status: 409 });
  }

  const shaped = shapeOpportunity(opp);
  const customersPipe = resolveCustomersPipeline(pipes);

  let existingCustomer: CloseOutPrefill["existingCustomer"] = null;
  if (customersPipe) {
    const custOpps = await fetchAllOpportunities(gctx, { pipelineId: customersPipe.id });
    const theirs = findByContact(custOpps, shaped.contactId);
    if (theirs) {
      const stage = customersPipe.stages.find((s) => s.id === theirs.pipelineStageId);
      const stageName = stage?.name ?? "";
      existingCustomer = {
        type: stageName.toLowerCase().includes("recurring") ? "recurring" : "one-time",
        stageName,
      };
    }
  }

  let alreadyClosedOut = false;
  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, t.slug) : null;
  if (client && tenantId) {
    const { data } = await client
      .from("customer_jobs")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_opportunity_id", opportunityId)
      .limit(1);
    alreadyClosedOut = Boolean(data && data.length > 0);
  }

  return Response.json({
    opportunityId,
    contactId: shaped.contactId,
    name: shaped.name,
    phone: shaped.phone,
    email: shaped.email,
    valueCents: centsFromMoney(shaped.value),
    existingCustomer,
    alreadyClosedOut,
    ...(customersPipe ? {} : { configError: "pipeline_not_found" as const }),
  } satisfies CloseOutPrefill);
};

function findByContact(opps: GhlOpportunity[], contactId: string): GhlOpportunity | null {
  if (!contactId) return null;
  return opps.find((o) => (o.contact?.id ?? o.contactId) === contactId) ?? null;
}

// Re-exported so the page and the POST share one dollars<->cents rule.
export { moneyFromCents };
