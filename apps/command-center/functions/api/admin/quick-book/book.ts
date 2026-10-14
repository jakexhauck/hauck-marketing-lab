import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlFetch, type GhlContext } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { createAppointment, getCalendar, isCalendarNotFound } from "../../lib/appointments";
import { locationZone, shapeFormFields, type QuickBookField } from "./form";

// POST /api/admin/quick-book/book (owner only). Jake has a caller on the phone
// and books them onto a client's calendar from Quick Book.
//
// Two writes, in order: the contact (so the form answers land on the person
// exactly as if they had used the client's booking widget), then the
// appointment. The contact write is safe to repeat; the appointment is NOT.
// createAppointment runs exactly once with no retry, same as setter/book.ts: a
// resend on a timeout could book one real customer into two real slots.
//
// Answers are only written for keys the calendar's form actually asks. The form
// is re-read here rather than trusted from the browser, so a stale screen or a
// hand-made request cannot write arbitrary contact fields.

export interface QuickBookBody {
  tenantId?: string;
  calendarId?: string;
  contactId?: string;
  contact?: { firstName?: string; lastName?: string; phone?: string; email?: string };
  answers?: Record<string, string>;
  startTime?: string;
  endTime?: string;
}

export type QuickBookValidation = { ok: true } | { ok: false; code: string };

// Pure. Exported for tests.
export function validateQuickBook(body: QuickBookBody): QuickBookValidation {
  if (!body.tenantId?.trim()) return { ok: false, code: "missing_tenant_id" };
  if (!body.calendarId?.trim()) return { ok: false, code: "missing_calendar_id" };
  if (!body.startTime || !body.endTime) return { ok: false, code: "missing_time_range" };
  const start = Date.parse(body.startTime);
  const end = Date.parse(body.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ok: false, code: "bad_time_range" };
  }
  // An existing contact already has a name and an id; nothing more is needed.
  if (body.contactId?.trim()) return { ok: true };
  if (!body.contact?.firstName?.trim()) return { ok: false, code: "missing_name" };
  // A new contact is found again by its phone (upsert keys on it).
  if (!body.contact.phone?.trim()) return { ok: false, code: "missing_phone" };
  return { ok: true };
}

// Form tags for standard fields are snake_case; the contacts API is camelCase.
const STANDARD_TO_CONTACT: Record<string, string> = {
  address: "address1",
  city: "city",
  state: "state",
  postal_code: "postalCode",
  company_name: "companyName",
  website: "website",
  date_of_birth: "dateOfBirth",
  source: "source",
};

// Pure. Exported for tests. Blank values are never sent: a blank would clear
// what GHL already holds for an existing contact.
export function buildContactPayload(
  body: QuickBookBody,
  fields: Pick<QuickBookField, "key" | "custom">[],
  timezone: string,
): Record<string, unknown> {
  const c = body.contact ?? {};
  const payload: Record<string, unknown> = {};
  const set = (k: string, v: string | undefined) => {
    const t = (v ?? "").trim();
    if (t) payload[k] = t;
  };
  // Name, phone and email are only written for a NEW contact. An existing one
  // is carried over as GHL holds it: the search shows a nameless contact by its
  // phone, and writing that back would make the phone number their first name.
  if (!body.contactId?.trim()) {
    set("firstName", c.firstName);
    set("lastName", c.lastName);
    set("phone", c.phone);
    set("email", c.email);
  }
  payload.timezone = timezone;

  const answers = body.answers ?? {};
  const customFields: { id: string; field_value: string }[] = [];
  for (const field of fields) {
    const value = (answers[field.key] ?? "").trim();
    if (!value) continue;
    if (field.custom) customFields.push({ id: field.key, field_value: value });
    else if (STANDARD_TO_CONTACT[field.key]) payload[STANDARD_TO_CONTACT[field.key]] = value;
  }
  if (customFields.length > 0) payload.customFields = customFields;
  return payload;
}

async function formFields(gctx: GhlContext, formId?: string): Promise<QuickBookField[]> {
  if (!formId) return [];
  const res = await ghlFetch(gctx, `/forms/${encodeURIComponent(formId)}`);
  return res.ok ? shapeFormFields(await res.json()) : [];
}

async function writeContact(
  gctx: GhlContext,
  contactId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; contactId: string } | { ok: false; status: number; body: string }> {
  const res = contactId
    ? await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
    : await ghlFetch(
        gctx,
        "/contacts/upsert",
        { method: "POST", body: JSON.stringify({ ...payload, locationId: gctx.locationId }) },
        { idempotentPost: true },
      );
  if (!res.ok) return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
  const data = (await res.json()) as { contact?: { id?: string }; id?: string };
  const id = contactId || data.contact?.id || data.id || "";
  if (!id) return { ok: false, status: 502, body: "contact write returned no id" };
  return { ok: true, contactId: id };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<QuickBookBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const valid = validateQuickBook(body);
  if (!valid.ok) return Response.json({ error: valid.code }, { status: 400 });

  const tenantId = body.tenantId!.trim();
  const calendarId = body.calendarId!.trim();

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const [calendar, timezone] = await Promise.all([
      getCalendar(gctx, calendarId),
      locationZone(ctx.env, gctx),
    ]);
    if (!calendar) {
      return Response.json({ error: "calendar_not_found", calendar: calendarId }, { status: 422 });
    }
    const fields = await formFields(gctx, calendar.formId);

    const contact = await writeContact(
      gctx,
      body.contactId?.trim() ?? "",
      buildContactPayload(body, fields, timezone),
    );
    if (!contact.ok) {
      return Response.json(
        { error: "contact_failed", status: contact.status, body: contact.body },
        { status: 502 },
      );
    }

    // Single attempt, no retry. See the header.
    const appt = await createAppointment(gctx, {
      calendarId,
      contactId: contact.contactId,
      startTime: body.startTime!,
      endTime: body.endTime!,
    });
    if (!appt.ok) {
      if (appt.needsStaff) return Response.json({ error: "needs_staff" }, { status: 422 });
      if (isCalendarNotFound(appt.status, appt.body)) {
        return Response.json({ error: "calendar_not_found", calendar: calendarId }, { status: 422 });
      }
      // GHL says the slot is gone (someone else took it, or Google busy synced
      // in since the list loaded). Its own code so the screen can say so.
      if (/slot|not available|no longer available/i.test(appt.body)) {
        return Response.json({ error: "slot_taken", contactId: contact.contactId }, { status: 409 });
      }
      return Response.json(
        { error: "ghl_error", status: appt.status, body: appt.body, contactId: contact.contactId },
        { status: 502 },
      );
    }

    const client = getServiceClient(ctx.env);
    if (client) {
      await logAdminAction(client, ctx.data.admin!.id, "quickbook.book", tenantId, {
        contactId: contact.contactId,
        calendarId,
        appointmentId: appt.id,
        startTime: body.startTime,
      });
    }

    return Response.json({ ok: true, id: appt.id, contactId: contact.contactId }, { status: 201 });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
