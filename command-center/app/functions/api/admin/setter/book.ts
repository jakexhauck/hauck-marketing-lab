import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { resolveCalendarByName, createAppointment } from "../../lib/appointments";

// POST /api/admin/setter/book (admin-only, gated in _middleware.ts). Books a
// real appointment on a named calendar the moment a setter gets someone on
// the phone and locks in a time. Calendar resolved BY NAME (never a
// hardcoded id, which differs per client) via the same
// resolveCalendarByName used by the client-facing booking endpoint
// (functions/api/appointments/index.ts), and the write goes through the
// same createAppointment in ../../lib/appointments unchanged.
//
// Terminal write: createAppointment deliberately does not retry on failure,
// because a retried POST can double-book a real customer into a real
// calendar. This route must honour that: the call below runs exactly once,
// no retry wrapper, no "for robustness" resend.
//
// Degrades honestly: a round-robin calendar with no team members assigned
// returns 422 { error: "needs_staff" } so the setter sees "this calendar
// has no staff assigned" instead of a generic failure that reads as their
// own mistake.

export interface BookBody {
  tenantId?: string;
  calendarName?: string;
  contactId?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

// Pure, split out so it is unit-testable without a request.
export function validateBookBody(body: BookBody): ValidationResult {
  if (!body.tenantId || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
  }
  if (!body.calendarName || !body.calendarName.trim()) {
    return { ok: false, code: "missing_calendar_name", error: "calendarName is required" };
  }
  if (!body.contactId || !body.contactId.trim()) {
    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
  }
  if (!body.startTime || !body.endTime) {
    return { ok: false, code: "missing_time_range", error: "startTime and endTime are required" };
  }
  return { ok: true };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<BookBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateBookBody(body);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const tenantId = body.tenantId!.trim();
  const calendarName = body.calendarName!.trim();
  const contactId = body.contactId!.trim();

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);

    const calendarId = await resolveCalendarByName(gctx, calendarName);
    if (!calendarId) {
      return Response.json(
        { error: "calendar_not_found", calendar: calendarName },
        { status: 422 },
      );
    }

    // Single attempt, no retry: see the file header. A second call here on a
    // timeout or transient error could create two appointments for the same
    // slot.
    const result = await createAppointment(gctx, {
      calendarId,
      contactId,
      startTime: body.startTime!,
      endTime: body.endTime!,
      title: body.title,
    });

    if (!result.ok) {
      if (result.needsStaff) {
        return Response.json({ error: "needs_staff" }, { status: 422 });
      }
      return Response.json(
        { error: "ghl_error", status: result.status, body: result.body },
        { status: 502 },
      );
    }

    const client = getServiceClient(ctx.env);
    if (client) {
      await logAdminAction(client, ctx.data.admin!.id, "setter.book", tenantId, {
        contactId,
        calendarName,
        appointmentId: result.id,
        startTime: body.startTime,
        endTime: body.endTime,
      });
    }

    return Response.json({ ok: true, id: result.id }, { status: 201 });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
