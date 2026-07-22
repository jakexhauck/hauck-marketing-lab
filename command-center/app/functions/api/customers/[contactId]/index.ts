import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type GhlContext,
} from "../../../lib/ghl";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import {
  resolveCustomersPipeline,
  isRecurringStage,
  serviceStateFor,
  type PipelineLike,
  type ServicePlanRow,
  type ServiceState,
} from "../../../lib/customers";

// GET /api/customers/:contactId — one customer's whole record: who they are,
// every job they have paid for, and when they are next due.
//
// This is the only surface that verifies the next-service appointment against
// GHL. The Customers list trusts our stored date (checking every row would mean
// a calendar fetch per customer); here, where one customer is on screen and
// someone is about to act on the date, we confirm the appointment still exists
// and has not been cancelled in GHL behind our back.

interface PipelinesResponse {
  pipelines: PipelineLike[];
}

interface JobDbRow {
  id: string;
  description: string;
  value_cents: number;
  completed_on: string;
  source_opportunity_id: string | null;
  created_at: string;
}

export interface ApiCustomerJob {
  id: string;
  description: string;
  valueCents: number;
  completedOn: string;
  // Logged by hand from this page rather than closed out from the board.
  addedManually: boolean;
}

export interface CustomerDetailResponse {
  contactId: string;
  opportunityId: string;
  name: string;
  phone: string;
  email: string;
  type: "one-time" | "recurring";
  stageId: string;
  stageName: string;
  jobs: ApiCustomerJob[];
  totalCents: number;
  nextServiceAt: string | null;
  serviceState: ServiceState | null;
  // The stored booking no longer exists in GHL (cancelled there, or the
  // appointment was deleted). The page says so instead of showing a date that
  // will not happen.
  appointmentMissing?: boolean;
  jobsUnavailable?: boolean;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const contactId = ctx.params.contactId as string;

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const pipeline = resolveCustomersPipeline(pipeData.pipelines ?? []);
  if (!pipeline) return Response.json({ error: "not_found" }, { status: 404 });

  const opps = await fetchAllOpportunities(gctx, { pipelineId: pipeline.id });
  const opp = opps.find((o) => (o.contact?.id ?? o.contactId) === contactId);
  if (!opp) return Response.json({ error: "not_found" }, { status: 404 });

  const shaped = shapeOpportunity(opp);
  const stage = pipeline.stages.find((s) => s.id === opp.pipelineStageId);
  const stageName = stage?.name ?? "";

  let jobs: ApiCustomerJob[] = [];
  let totalCents = 0;
  let plan: ServicePlanRow | null = null;
  let jobsUnavailable = false;

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, t.slug) : null;
  if (client && tenantId) {
    const [jobsRes, planRes] = await Promise.all([
      client
        .from("customer_jobs")
        .select("id, description, value_cents, completed_on, source_opportunity_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("ghl_contact_id", contactId)
        .order("completed_on", { ascending: false }),
      client
        .from("customer_service_plan")
        .select("next_service_at, status, ghl_appointment_id")
        .eq("tenant_id", tenantId)
        .eq("ghl_contact_id", contactId)
        .maybeSingle(),
    ]);
    if (jobsRes.error) {
      jobsUnavailable = true;
    } else {
      jobs = (jobsRes.data as JobDbRow[]).map((r) => ({
        id: r.id,
        description: r.description,
        valueCents: r.value_cents,
        completedOn: r.completed_on,
        addedManually: r.source_opportunity_id === null,
      }));
      totalCents = jobs.reduce((sum, j) => sum + j.valueCents, 0);
    }
    if (planRes.data) {
      const row = planRes.data as {
        next_service_at: string | null;
        status: string;
        ghl_appointment_id: string | null;
      };
      plan = {
        ghlContactId: contactId,
        nextServiceAt: row.next_service_at,
        status: row.status === "booked" || row.status === "none" ? row.status : "unplanned",
        ghlAppointmentId: row.ghl_appointment_id,
      };
    }
  } else {
    jobsUnavailable = true;
  }

  // Verify the booking still exists. Best-effort: if the lookup itself fails we
  // say nothing rather than wrongly claim the appointment is gone.
  let appointmentMissing = false;
  if (plan?.ghlAppointmentId) {
    try {
      await ghlJson(
        gctx,
        `/calendars/events/appointments/${encodeURIComponent(plan.ghlAppointmentId)}`,
      );
    } catch (e) {
      if (/ returned 404/.test(String(e))) appointmentMissing = true;
      else console.warn("[customer detail] appointment check failed", e);
    }
  }

  return Response.json({
    contactId,
    opportunityId: shaped.id,
    name: shaped.name,
    phone: shaped.phone,
    email: shaped.email,
    type: isRecurringStage(stageName) ? "recurring" : "one-time",
    stageId: opp.pipelineStageId ?? "",
    stageName,
    jobs,
    totalCents,
    nextServiceAt: plan?.nextServiceAt ?? null,
    serviceState: serviceStateFor(plan, new Date()),
    ...(appointmentMissing ? { appointmentMissing: true } : {}),
    ...(jobsUnavailable ? { jobsUnavailable: true } : {}),
  } satisfies CustomerDetailResponse);
};
