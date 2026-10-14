import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlContext,
} from "../../../lib/ghl";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import {
  resolveCustomersPipeline,
  buildCustomers,
  type CustomerJobRow,
  type ServicePlanRow,
  type PipelineLike,
  type ApiCustomerColumn,
} from "../../../lib/customers";

// GET /api/sales/customers: the Customers page's whole read.
//
// Joins the two halves of a customer (see functions/lib/customers.ts): the GHL
// "Customers" pipeline says WHO they are and which type, our customer_jobs rows
// say what work they have paid for. Columns come back in the order GHL returns
// its stages, each already totalled, so the page's tiles are just the columns
// summed and can never disagree with the rows beneath them.
//
// The pipeline resolves BY NAME per tenant. A client without a Customers
// pipeline is not an error: they get empty columns and the page shows its short
// honest empty state rather than a placeholder promise.

interface PipelinesResponse {
  pipelines: PipelineLike[];
}

interface JobDbRow {
  id: string;
  ghl_contact_id: string;
  description: string;
  value_cents: number;
  completed_on: string;
  source_opportunity_id: string | null;
}

interface PlanDbRow {
  ghl_contact_id: string;
  next_service_at: string | null;
  status: string;
  ghl_appointment_id: string | null;
}

export interface CustomersResponse {
  columns: ApiCustomerColumn[];
  // True when we could not reach the tenant's job history (Supabase absent or
  // the tenant unresolvable). The page still lists customers from GHL, but every
  // total reads zero, so it must say so rather than imply nobody has paid.
  jobsUnavailable?: boolean;
  // The tenant has no Customers pipeline in GHL at all.
  configError?: "pipeline_not_found";
}

function shapeJob(r: JobDbRow): CustomerJobRow {
  return {
    id: r.id,
    ghlContactId: r.ghl_contact_id,
    description: r.description,
    valueCents: r.value_cents,
    completedOn: r.completed_on,
    sourceOpportunityId: r.source_opportunity_id,
  };
}

function shapePlan(r: PlanDbRow): ServicePlanRow {
  const status =
    r.status === "booked" || r.status === "none" ? r.status : "unplanned";
  return {
    ghlContactId: r.ghl_contact_id,
    nextServiceAt: r.next_service_at,
    status,
    ghlAppointmentId: r.ghl_appointment_id,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const pipeline = resolveCustomersPipeline(pipeData.pipelines ?? []);
  if (!pipeline) {
    return Response.json({
      columns: [],
      configError: "pipeline_not_found",
    } satisfies CustomersResponse);
  }

  const opps = await fetchAllOpportunities(gctx, { pipelineId: pipeline.id });

  // Job history is best-effort: a Supabase outage must not blank the customer
  // list itself, which GHL alone can answer.
  let jobs: CustomerJobRow[] = [];
  let plans: ServicePlanRow[] = [];
  let jobsUnavailable = false;

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, t.slug) : null;
  if (client && tenantId) {
    const [jobsRes, plansRes] = await Promise.all([
      client
        .from("customer_jobs")
        .select("id, ghl_contact_id, description, value_cents, completed_on, source_opportunity_id")
        .eq("tenant_id", tenantId),
      client
        .from("customer_service_plan")
        .select("ghl_contact_id, next_service_at, status, ghl_appointment_id")
        .eq("tenant_id", tenantId),
    ]);
    if (jobsRes.error || plansRes.error) {
      console.warn("[customers] job history read failed", jobsRes.error ?? plansRes.error);
      jobsUnavailable = true;
    } else {
      jobs = (jobsRes.data as JobDbRow[]).map(shapeJob);
      plans = (plansRes.data as PlanDbRow[]).map(shapePlan);
    }
  } else {
    jobsUnavailable = true;
  }

  const { columns } = buildCustomers({
    opps,
    stages: pipeline.stages,
    jobs,
    plans,
    now: new Date(),
  });

  return Response.json({
    columns,
    ...(jobsUnavailable ? { jobsUnavailable: true } : {}),
  } satisfies CustomersResponse);
};
