import type { Env, ApiData } from "../../../lib/env";
import { tenantTimezone } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson, type GhlContext, type GhlOpportunity } from "../../../lib/ghl";
import { startOfDayOffsetMs } from "../../../lib/tz";
import { putOpportunity } from "../../lib/writes";
import { createAppointment, resolveCalendarByName } from "../../lib/appointments";
import {
  resolveTargetStageId,
  resolveServiceFieldId,
  shapeHandoff,
  OUTCOME_TAG,
  type ApiHandoff,
  type HandoffStatus,
  type HandoffLostReason,
} from "../shared";

// PATCH /api/handoffs/:id (owner endpoint). `:id` is the opportunity id. Records
// what the owner did with a handed-off lead: moves the opportunity's stage AND
// applies the downstream tag / writes the extra data (value, note, task,
// appointment), so the move is instant and the client's automations still fire.
//
//   won         -> Won stage + status won + value   + tag "owner won"
//   lost        -> Lost stage + status lost + reason note + tag "owner lost"
//   later       -> Follow Up stage + follow-up task + tag "owner follow up"
//   estimate_set-> book Home Estimate appointment, then Estimate Booked stage
//   job_booked  -> book Job appointment, then Job Booked stage
//   new         -> reopen: back to Handed Off, status open

interface PatchBody {
  status?: HandoffStatus;
  value?: number | null;
  lostReason?: HandoffLostReason | null;
  estimateAt?: string;
  jobAt?: string;
  followUpAt?: string;
  followUpNote?: string | null;
  address?: string;
  service?: string;
}

const LOST_LABELS: Record<HandoffLostReason, string> = {
  price: "Price",
  timing: "Timing",
  competitor: "Competitor",
  ghosted: "Ghosted",
  diy: "DIY",
  other: "Other",
};

const VALID_STATUSES: HandoffStatus[] = [
  "new",
  "estimate_set",
  "job_booked",
  "won",
  "lost",
  "later",
];

// The calendar each booking status writes onto, resolved by name per tenant.
const BOOKING_CALENDAR: Partial<Record<HandoffStatus, string>> = {
  estimate_set: "Home Estimate",
  job_booked: "Job",
};

// Best-effort tag apply: the stage move is the primary action and already
// succeeded, so a tag POST that fails is logged, not surfaced as a failure.
async function applyTag(gctx: GhlContext, contactId: string, tag: string | null): Promise<void> {
  if (!tag || !contactId) return;
  try {
    await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [tag] }),
    });
  } catch (e) {
    console.warn("[handoffs.patch] tag apply failed", tag, e);
  }
}

// Write the service address onto the contact + the service scope into a custom
// field (when one exists) and a human-readable note, so the Job pre-fill can
// read the address/service back. All best-effort: the appointment + stage move
// already landed, so a contact write that fails must not fail the booking.
async function writeBookingDetails(
  gctx: GhlContext,
  contactId: string,
  address: string,
  service: string,
): Promise<void> {
  if (!contactId) return;
  const contactPatch: Record<string, unknown> = {};
  if (address) contactPatch.address1 = address;
  if (service) {
    const fieldId = await resolveServiceFieldId(gctx);
    if (fieldId) contactPatch.customFields = [{ id: fieldId, value: service }];
  }
  if (Object.keys(contactPatch).length > 0) {
    try {
      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}`, {
        method: "PUT",
        body: JSON.stringify(contactPatch),
      });
    } catch (e) {
      console.warn("[handoffs.patch] contact detail write failed", e);
    }
  }
  if (service) {
    try {
      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: `Service booked: ${service}` }),
      });
    } catch (e) {
      console.warn("[handoffs.patch] service note write failed", e);
    }
  }
}

export const onRequestPatch: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const id = ctx.params.id as string;
  if (!id) return Response.json({ error: "missing_id" }, { status: 400 });

  const body = await readJsonBody<PatchBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status)) {
    return Response.json({ error: "invalid_status" }, { status: 400 });
  }

  // Fetch the opportunity to get its contact + pipeline (the client sends only
  // the opportunity id).
  let opp: GhlOpportunity;
  try {
    const data = await ghlJson<{ opportunity: GhlOpportunity }>(
      gctx,
      `/opportunities/${encodeURIComponent(id)}`,
    );
    if (!data.opportunity) return Response.json({ error: "not_found" }, { status: 404 });
    opp = data.opportunity;
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const contactId = opp.contact?.id ?? opp.contactId ?? "";
  const pipelineId = opp.pipelineId ?? "";

  const stageId = pipelineId
    ? await resolveTargetStageId(gctx, pipelineId, status)
    : null;
  if (!stageId) return Response.json({ error: "stage_not_found" }, { status: 404 });

  // Booking statuses: create the real appointment FIRST (a stage move without a
  // booking would be a lie), then move the stage, then write the details back.
  if (status === "estimate_set" || status === "job_booked") {
    const startTime = status === "estimate_set" ? body.estimateAt : body.jobAt;
    if (!startTime) return Response.json({ error: "missing_time" }, { status: 400 });
    if (!contactId) return Response.json({ error: "missing_contact" }, { status: 400 });

    const calId = await resolveCalendarByName(gctx, BOOKING_CALENDAR[status] as string);
    if (!calId) return Response.json({ error: "calendar_not_found" }, { status: 502 });

    const endTime = new Date(new Date(startTime).getTime() + 60 * 60_000).toISOString();
    const titleName = opp.contact?.name || opp.name || "Lead";
    const appt = await createAppointment(gctx, {
      calendarId: calId,
      contactId,
      startTime,
      endTime,
      title: `${status === "estimate_set" ? "Home Estimate" : "Install"} — ${titleName}`,
    });
    if (!appt.ok) {
      return Response.json(
        { error: appt.needsStaff ? "calendar_needs_staff" : "booking_failed", detail: appt.body },
        { status: 502 },
      );
    }

    const moved = await putOpportunity(gctx, id, { pipelineStageId: stageId });
    if (!moved.ok) {
      return Response.json({ error: "ghl_error", status: moved.status }, { status: 502 });
    }

    await writeBookingDetails(gctx, contactId, (body.address ?? "").trim(), (body.service ?? "").trim());

    const handoff = shapeHandoff(opp, status, {
      address: (body.address ?? "").trim() || null,
      service: (body.service ?? "").trim() || null,
    });
    handoff.estimateAt = status === "estimate_set" ? startTime : handoff.estimateAt;
    handoff.jobAt = status === "job_booked" ? startTime : handoff.jobAt;
    return Response.json({ handoff });
  }

  // Non-booking statuses: move the stage (+ status for terminal outcomes), then
  // apply the tag / write the note or task.
  const fields: { pipelineStageId: string; status?: string; monetaryValue?: number } = {
    pipelineStageId: stageId,
  };
  if (status === "won") {
    fields.status = "won";
    if (typeof body.value === "number") fields.monetaryValue = body.value;
  } else if (status === "lost") {
    fields.status = "lost";
  } else if (status === "new") {
    fields.status = "open";
  }

  const moved = await putOpportunity(gctx, id, fields);
  if (!moved.ok) {
    return Response.json({ error: "ghl_error", status: moved.status }, { status: 502 });
  }

  // Side effects per outcome (best-effort, stage move already succeeded).
  if (status === "lost" && contactId) {
    const reasonLabel = body.lostReason ? LOST_LABELS[body.lostReason] : null;
    if (reasonLabel) {
      try {
        await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/notes`, {
          method: "POST",
          body: JSON.stringify({ body: `Lost: ${reasonLabel}` }),
        });
      } catch (e) {
        console.warn("[handoffs.patch] lost note failed", e);
      }
    }
  }
  if (status === "later" && contactId) {
    const titleName = opp.contact?.name || opp.name || "lead";
    let dueDate = typeof body.followUpAt === "string" ? body.followUpAt.trim() : "";
    if (!dueDate) {
      const zone = tenantTimezone(ctx.env);
      dueDate = new Date(startOfDayOffsetMs(zone, 1) - 60_000).toISOString();
    }
    const taskPayload: Record<string, unknown> = {
      title: `Follow up: ${titleName}`,
      dueDate,
      completed: false,
    };
    if (body.followUpNote && body.followUpNote.trim()) taskPayload.body = body.followUpNote.trim();
    try {
      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tasks`, {
        method: "POST",
        body: JSON.stringify(taskPayload),
      });
    } catch (e) {
      console.warn("[handoffs.patch] follow-up task failed", e);
    }
  }
  await applyTag(gctx, contactId, OUTCOME_TAG[status]);

  const handoff: ApiHandoff = shapeHandoff(opp, status);
  if (status === "won") handoff.value = typeof body.value === "number" ? body.value : handoff.value;
  if (status === "lost") handoff.lostReason = body.lostReason ?? null;
  if (status === "later") {
    handoff.followUpAt = body.followUpAt ?? null;
    handoff.followUpNote = body.followUpNote ?? null;
  }
  return Response.json({ handoff });
};
