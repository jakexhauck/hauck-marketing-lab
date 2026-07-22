import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type GhlContext,
  type GhlOpportunity,
} from "../../../lib/ghl";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { putOpportunity } from "../../lib/writes";
import { resolveCalendarByName, createAppointment } from "../../lib/appointments";
import { resolveCustomersPipeline, type PipelineLike } from "../../../lib/customers";
import { resolveJobCompletedStage } from "../../../lib/closeOutQueue";
import { planCloseOut, type CustomerType, type NextServiceChoice } from "../../../lib/closeOut";

// POST /api/sales/close-outs — close out a completed job.
//
// planCloseOut (functions/lib/closeOut.ts) decides what should happen; this
// executes it. The ORDER is the interesting part, and it is deliberate:
//
//   1. GHL      the opportunity move / park
//   2. Supabase the job row + service plan
//   3. Calendar the next-service appointment
//
// GHL first because a human can always repair our database from the customer
// page (add / edit / delete a job), but nobody can repair a half-moved
// opportunity from the UI. So if step 2 fails after step 1, we report honestly
// and the customer exists at $0 — recoverable. If we did it the other way round
// and GHL failed, we would have a job logged for a customer who does not exist.
//
// The calendar is last and never fatal: losing a real job record over a booking
// problem would be absurd. A failed booking keeps the date with no appointment
// id, which functions/lib/customers.ts reads back as "unplanned" (amber), not as
// a booking that does not exist.

const SERVICE_CALENDAR = "window cleaning";
// Willis's service calendar is a 3-hour round-robin slot.
const SERVICE_DURATION_MS = 3 * 60 * 60_000;

interface PipelinesResponse {
  pipelines: PipelineLike[];
}

interface CloseOutBody {
  opportunityId: string;
  type: CustomerType;
  description: string;
  valueCents: number;
  completedOn: string;
  nextService: NextServiceChoice;
}

export interface CloseOutSuccess {
  ok: true;
  contactId: string;
  // Set when the job and the move landed but the calendar did not. The page
  // keeps the success, names the reason and offers to book from the customer.
  appointmentError?: string;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const body = await readJsonBody<CloseOutBody>(ctx.request);

  if (!body?.opportunityId || !body.type) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const pipes = pipeData.pipelines ?? [];
  const customersPipe = resolveCustomersPipeline(pipes);
  if (!customersPipe) {
    return Response.json({ error: "pipeline_not_found" }, { status: 409 });
  }
  const queue = resolveJobCompletedStage(pipes);
  if (!queue) return Response.json({ error: "queue_not_found" }, { status: 409 });

  const salesOpps = await fetchAllOpportunities(gctx, { pipelineId: queue.pipelineId });
  const source = salesOpps.find((o) => o.id === body.opportunityId);
  if (!source) return Response.json({ error: "not_found" }, { status: 404 });
  if (source.pipelineStageId !== queue.stageId) {
    return Response.json({ error: "not_in_queue" }, { status: 409 });
  }

  const shaped = shapeOpportunity(source);
  const contactId = shaped.contactId;
  if (!contactId) return Response.json({ error: "no_contact" }, { status: 409 });

  const custOpps = await fetchAllOpportunities(gctx, { pipelineId: customersPipe.id });
  const existing = findByContact(custOpps, contactId);

  const planned = planCloseOut({
    sourceOpportunityId: body.opportunityId,
    contactId,
    type: body.type,
    description: body.description ?? "",
    valueCents: body.valueCents,
    completedOn: body.completedOn ?? "",
    nextService: body.nextService ?? { mode: "none" },
    pipeline: customersPipe,
    existingCustomerOpp: existing
      ? { id: existing.id, pipelineStageId: existing.pipelineStageId ?? "" }
      : null,
    today: new Date(),
  });
  if (!planned.ok) {
    return Response.json({ error: planned.error }, { status: 400 });
  }
  const { ghlWrites, job, plan, appointment } = planned.plan;

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, t.slug) : null;
  if (!client || !tenantId) {
    // Refuse rather than move the opportunity with nowhere to record the job:
    // that would silently lose the client's revenue with no way to notice.
    return Response.json({ error: "jobs_unavailable" }, { status: 503 });
  }

  // Cheap pre-check for the common double-submit. The unique index is still the
  // real guard (two requests in flight at once both pass this), but it turns the
  // ordinary case into a clean 409 instead of a moved opportunity plus a
  // constraint violation.
  const { data: already } = await client
    .from("customer_jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_opportunity_id", body.opportunityId)
    .limit(1);
  if (already && already.length > 0) {
    return Response.json({ error: "already_closed_out", contactId }, { status: 409 });
  }

  // 1. GHL.
  for (const w of ghlWrites) {
    const res =
      w.kind === "move"
        ? await putOpportunity(gctx, w.opportunityId, {
            pipelineId: w.pipelineId,
            pipelineStageId: w.pipelineStageId,
            status: w.status,
          })
        : await putOpportunity(gctx, w.opportunityId, { status: w.status });
    if (!res.ok) {
      return Response.json(
        { error: "ghl_error", status: res.status, body: res.body },
        { status: 502 },
      );
    }
  }

  // 2. Our database.
  const { error: jobError } = await client.from("customer_jobs").insert({
    tenant_id: tenantId,
    ghl_contact_id: job.ghlContactId,
    description: job.description,
    value_cents: job.valueCents,
    completed_on: job.completedOn,
    source_opportunity_id: job.sourceOpportunityId,
    created_by: createdByFor(ctx),
  });
  if (jobError) {
    // Postgres 23505: the unique index caught a genuine race. The other request
    // logged the job, so the outcome the user wanted has happened.
    if (jobError.code === "23505") {
      return Response.json({ error: "already_closed_out", contactId }, { status: 409 });
    }
    console.error("[close-outs] job insert failed AFTER the GHL move", jobError);
    return Response.json({ error: "job_not_saved", contactId }, { status: 500 });
  }

  if (plan.action === "clear") {
    await client
      .from("customer_service_plan")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("ghl_contact_id", contactId);
  } else {
    await client.from("customer_service_plan").upsert(
      {
        tenant_id: tenantId,
        ghl_contact_id: contactId,
        next_service_at: plan.nextServiceAt,
        status: plan.status,
        ghl_appointment_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,ghl_contact_id" },
    );
  }

  // 3. The calendar. Never fatal.
  let appointmentError: string | undefined;
  if (appointment) {
    const calendarId = await resolveCalendarByName(gctx, SERVICE_CALENDAR);
    if (!calendarId) {
      appointmentError = "No service calendar found to book on.";
    } else {
      const start = new Date(appointment.at);
      const res = await createAppointment(gctx, {
        calendarId,
        contactId,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + SERVICE_DURATION_MS).toISOString(),
        title: job.description,
      });
      if (res.ok) {
        await client
          .from("customer_service_plan")
          .update({ ghl_appointment_id: res.id })
          .eq("tenant_id", tenantId)
          .eq("ghl_contact_id", contactId);
      } else {
        appointmentError = res.needsStaff
          ? "That calendar has no team members assigned, so nothing could be booked."
          : `The calendar rejected the booking (${res.status}).`;
      }
    }
  }

  return Response.json({
    ok: true,
    contactId,
    ...(appointmentError ? { appointmentError } : {}),
  } satisfies CloseOutSuccess);
};

function findByContact(opps: GhlOpportunity[], contactId: string): GhlOpportunity | null {
  return opps.find((o) => (o.contact?.id ?? o.contactId) === contactId) ?? null;
}

function createdByFor(ctx: { data: ApiData }): string {
  return ctx.data.staff?.id ? `staff:${ctx.data.staff.id}` : "owner";
}
