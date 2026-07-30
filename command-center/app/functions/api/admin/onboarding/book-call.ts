import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { ghlFetch } from "../../../lib/ghl";
import { getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { createAppointment, isCalendarNotFound } from "../../lib/appointments";
import {
  bookingProblems,
  onboardingCalendarId,
  onboardingCallTitle,
  type BookCallInput,
} from "../../../lib/onboardingCall";

// POST /api/admin/onboarding/book-call  (admin-only)
//
// Book a new client's onboarding call from the Add a client page, usually while
// they are on the phone. The same calendar the intake funnel books, so a call
// arranged here and a call the client booked themselves are the same thing in
// the same place.
//
// Two writes, in this order and for the same reason as the cold-call booking:
//
//   1. The person becomes a contact on the agency account. GHL sends the
//      reminders for this call, and a reminder needs somewhere to go.
//   2. The appointment is created.
//
// If step 2 fails, step 1 has still left a contact behind, which is harmless: a
// contact with no meeting is a person we know, whereas a meeting with no contact
// would be a call nobody gets reminded about.
//
// Terminal write: createAppointment does not retry, and neither does this. A
// resent POST double-books a real slot on a real calendar.

async function upsertContact(
  gctx: { locationId: string; token: string },
  input: BookCallInput,
): Promise<{ ok: true; contactId: string } | { ok: false; status: number; body: string }> {
  const [firstName, ...rest] = input.contactName.trim().split(/\s+/);
  const payload: Record<string, unknown> = {
    locationId: gctx.locationId,
    firstName: firstName || "Client",
    lastName: rest.join(" "),
    // Where this person came from, visible in GHL rather than only in our app.
    source: "Client onboarding",
  };
  if (input.email) payload.email = input.email;
  if (input.phone) payload.phone = input.phone;
  // Only when we have one: sending "" would blank a company name already
  // corrected in GoHighLevel.
  if (input.businessName.trim()) payload.companyName = input.businessName.trim();

  // GHL's upsert matches on phone/email within the location, so booking the same
  // person twice does not litter the CRM with duplicates.
  const res = await ghlFetch(gctx, "/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  const body = (await res.json()) as { contact?: { id?: string } };
  const contactId = body.contact?.id;
  if (!contactId) return { ok: false, status: 502, body: "GHL returned no contact id" };
  return { ok: true, contactId };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const raw = await readJsonBody<Partial<BookCallInput>>(ctx.request);
  if (!raw) return Response.json({ error: "invalid body" }, { status: 400 });

  const input: BookCallInput = {
    businessName: (raw.businessName ?? "").trim(),
    contactName: (raw.contactName ?? "").trim(),
    email: (raw.email ?? "").trim(),
    phone: (raw.phone ?? "").trim(),
    startTime: (raw.startTime ?? "").trim(),
    endTime: (raw.endTime ?? "").trim(),
  };

  const problems = bookingProblems(input);
  if (problems.length > 0) {
    return Response.json({ error: problems[0].message, problems }, { status: 400 });
  }

  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (err instanceof AgencyGhlError) {
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    throw err;
  }

  const contact = await upsertContact(gctx, input);
  if (!contact.ok) {
    return Response.json(
      { error: `Could not create the contact in GoHighLevel: ${contact.body}` },
      { status: 502 },
    );
  }

  const calendarId = onboardingCalendarId(ctx.env);
  const appt = await createAppointment(gctx, {
    calendarId,
    contactId: contact.contactId,
    startTime: input.startTime,
    endTime: input.endTime,
    title: onboardingCallTitle(input.businessName, input.contactName),
  });

  if (!appt.ok) {
    if (isCalendarNotFound(appt.status, appt.body)) {
      return Response.json(
        { error: "That onboarding calendar no longer exists in GoHighLevel." },
        { status: 409 },
      );
    }
    if (appt.needsStaff) {
      return Response.json(
        { error: "The onboarding calendar has nobody assigned to it in GoHighLevel." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: `GoHighLevel refused the booking: ${appt.body}` },
      { status: 502 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (client) {
    await logAdminAction(client, ctx.data.admin!.id, "onboarding.book-call", null, {
      businessName: input.businessName,
      startTime: input.startTime,
    });
  }

  return Response.json({
    ok: true,
    contactId: contact.contactId,
    startTime: input.startTime,
    endTime: input.endTime,
  });
};
