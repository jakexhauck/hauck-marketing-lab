import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { ghlFetch } from "../../../lib/ghl";
import { getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { createAppointment, isCalendarNotFound } from "../../lib/appointments";
import { resolveAgencySalesPipeline, routeSalesCall } from "../../lib/agencySales";

// POST /api/admin/cold-call/book  (admin-only)
//
// The moment a cold call turns into a meeting. Three things happen, in this
// order, and the order matters:
//
//   1. The prospect becomes a real contact in Hauck Marketing's GHL. Until now
//      they only existed in the app's lead book; a meeting needs someone for
//      GHL to send reminders to.
//   2. The appointment is created on the agency calendar.
//   3. The lead is marked Booked with that date.
//
// If step 2 fails, nothing is written to the lead: a lead that says Booked with
// no meeting behind it is worse than a failed booking, because the caller moves
// on believing it landed.
//
// Terminal write: createAppointment does not retry, and neither does this. A
// resent booking POST double-books a real slot on a real calendar.

interface Body {
  leadId?: string;
  calendarId?: string;
  startTime?: string;
  endTime?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;

interface LeadRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  assigned_to: string | null;
  // 0059. The meeting record has carried a business_name column since 0057 and
  // never had anything to put in it.
  business_name?: string | null;
  timezone?: string | null;
  source?: string | null;
}

// Create or update the prospect as a contact on the agency account. GHL's
// upsert matches on phone/email within the location, so re-booking the same
// person does not litter the CRM with duplicates.
async function upsertContact(
  gctx: { locationId: string; token: string },
  lead: LeadRow,
): Promise<{ ok: true; contactId: string } | { ok: false; status: number; body: string }> {
  const payload: Record<string, unknown> = {
    locationId: gctx.locationId,
    firstName: lead.first_name || "Prospect",
    lastName: lead.last_name || "",
    // Where this person came from, visible in GHL rather than only in our app.
    source: "Cold call",
  };
  if (lead.phone) payload.phone = lead.phone;
  if (lead.email) payload.email = lead.email;
  // Only when we have one: sending "" would blank a company name already
  // corrected in GoHighLevel, which is where Jake works the board.
  if (lead.business_name) payload.companyName = lead.business_name;

  const res = await ghlFetch(gctx, "/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  const data = (await res.json()) as {
    contact?: { id?: string };
    id?: string;
  };
  const contactId = data.contact?.id ?? data.id ?? "";
  if (!contactId) {
    return { ok: false, status: 502, body: "upsert returned no contact id" };
  }
  return { ok: true, contactId };
}

interface RoutedBooking {
  opportunityId: string | null;
  stage: string | null;
  // A sentence fit for the console, or null when there is nothing to report.
  // "Not connected" is not an error about this meeting, so it stays null.
  error: string | null;
}

// Put the new meeting on the Sales Pipeline at Appointment Booked.
//
// Nothing here is allowed to fail the booking. The appointment is already on a
// real calendar with a real person expecting it; a pipeline that did not catch
// up is a line on the meetings page, not a reason to tell the caller their
// booking did not happen.
async function routeBookedMeeting(
  env: Env,
  contactId: string,
  prospectName: string,
  businessName: string | null | undefined,
): Promise<RoutedBooking> {
  let gctx;
  try {
    gctx = getAgencyGhlContext(env);
  } catch {
    return { opportunityId: null, stage: null, error: null };
  }

  try {
    const pipeline = await resolveAgencySalesPipeline(gctx);
    if (!pipeline) {
      return {
        opportunityId: null,
        stage: null,
        error: "No Sales Pipeline found in GoHighLevel, so no card was created.",
      };
    }
    const result = await routeSalesCall(gctx, pipeline, {
      opportunityId: null,
      contactId,
      name: [prospectName, businessName].filter(Boolean).join(" - ") || prospectName,
      // No outcome yet: a meeting that has not happened routes to Appointment
      // Booked, which is the whole point of the stage.
      outcome: null,
    });
    return result.ok
      ? { opportunityId: result.opportunityId, stage: result.stage, error: null }
      : { opportunityId: null, stage: null, error: result.error };
  } catch (err) {
    console.error("[cold-call/book] pipeline routing failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return { opportunityId: null, stage: null, error: message.split("\n")[0].slice(0, 200) };
  }
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<Body>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const leadId = (body.leadId ?? "").trim();
  const calendarId = (body.calendarId ?? "").trim();
  const startTime = (body.startTime ?? "").trim();
  const endTime = (body.endTime ?? "").trim();

  if (!leadId) return Response.json({ error: "leadId is required" }, { status: 400 });
  if (!calendarId) return Response.json({ error: "calendarId is required" }, { status: 400 });
  if (!ISO.test(startTime) || !ISO.test(endTime)) {
    return Response.json({ error: "startTime and endTime are required" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (err instanceof AgencyGhlError) {
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    throw err;
  }

  const admin = ctx.data.admin!;
  // A caller may only book a lead on their own queue. Scoping the read means a
  // guessed id reports not found rather than booking someone else's prospect.
  let query = client
    .from("leads")
    .select("id, first_name, last_name, phone, email, assigned_to, business_name, timezone, source")
    .eq("id", leadId)
    .is("deleted_at", null);
  if (admin.role !== "owner") query = query.eq("assigned_to", admin.id);
  const { data: leadRow } = await query.maybeSingle();
  const lead = leadRow as LeadRow | null;
  if (!lead) return Response.json({ error: "lead not found" }, { status: 404 });
  if (!lead.phone && !lead.email) {
    return Response.json(
      { error: "That prospect has no phone or email, so GoHighLevel cannot hold a booking." },
      { status: 422 },
    );
  }

  const contact = await upsertContact(gctx, lead);
  if (!contact.ok) {
    console.error("[cold-call/book] contact upsert failed", contact.status, contact.body);
    return Response.json({ error: "could not create the contact" }, { status: 502 });
  }

  const name = `${lead.first_name} ${lead.last_name}`.trim() || "Cold call prospect";
  const appt = await createAppointment(gctx, {
    calendarId,
    contactId: contact.contactId,
    startTime,
    endTime,
    title: `Discovery call - ${name}`,
  });

  if (!appt.ok) {
    if (appt.needsStaff) {
      return Response.json({ error: "needs_staff" }, { status: 422 });
    }
    if (isCalendarNotFound(appt.status, appt.body)) {
      return Response.json({ error: "calendar_not_found" }, { status: 422 });
    }
    console.error("[cold-call/book] appointment failed", appt.status, appt.body);
    // Nothing has been written to the lead, so the caller can try again.
    return Response.json({ error: "could not book that time" }, { status: 502 });
  }

  // Only now does the lead say Booked.
  const day = startTime.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { data: updated } = await client
    .from("leads")
    .update({
      status: "Booked",
      appointment_date: day,
      last_contact: today,
      follow_up_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select("id")
    .maybeSingle();

  // The card on the agency's Sales Pipeline (0060). A meeting that exists only
  // in this database is a meeting Jake cannot see on the board he actually
  // reads, which is how that pipeline came to hold zero opportunities while the
  // app knew about every booking.
  //
  // Best effort, and after the appointment: the slot is real by now, so a CRM
  // that would not answer must not turn a successful booking into an error.
  const routed = await routeBookedMeeting(ctx.env, contact.contactId, name, lead.business_name);

  // The meeting's own record (0057), so what it BECOMES has somewhere to live.
  // Without this a booking is the last thing the app knows about a prospect, and
  // booked-to-showed-to-closed stops one step short of the number that says
  // whether any of the dialing was worth doing.
  //
  // Best-effort, on purpose, and after everything above: the appointment is real
  // on a real calendar by now, so failing the request here would tell the caller
  // a booking did not happen when it did. Keyed on the appointment id, so a
  // booking made twice updates one row rather than growing a second.
  const { error: meetingError } = await client.from("sales_calls").upsert(
    {
      ghl_appointment_id: appt.id,
      ghl_contact_id: contact.contactId,
      lead_id: leadId,
      // Copied rather than joined, so a purged prospect still has a name on the
      // revenue line.
      prospect_name: name,
      business_name: lead.business_name ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      timezone: lead.timezone ?? "",
      source: lead.source ?? "Cold call",
      scheduled_at: startTime,
      appointment_status: "confirmed",
      ghl_opportunity_id: routed.opportunityId,
      ghl_stage: routed.stage,
      ghl_error: routed.error,
      logged_by: admin.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ghl_appointment_id" },
  );
  if (meetingError) {
    console.error("[cold-call/book] sales_calls upsert failed", meetingError.message);
  }

  await logAdminAction(client, admin.id, "coldcall.book", null, {
    leadId,
    calendarId,
    startTime,
    appointmentId: appt.id,
    contactId: contact.contactId,
  });

  return Response.json({
    ok: true,
    appointmentId: appt.id,
    contactId: contact.contactId,
    appointmentDate: day,
    // The booking is real even if the local row somehow did not update; say so
    // rather than reporting a clean success that hides a mismatch.
    leadUpdated: Boolean(updated),
  });
};
