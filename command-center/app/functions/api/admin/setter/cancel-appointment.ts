import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { cancelAppointment } from "../../lib/appointments";

// POST /api/admin/setter/cancel-appointment (admin-only, gated in
// _middleware.ts). Cancels a lead's booked appointment in the client's own
// CRM, used by the Phone Appt Confirmed cockpit's Reschedule and
// Cancel + Follow Up actions (the SOP deletes the old booking before any
// rebook). Like setter/tags.ts this MUST resolve the tenant's credentials
// through getGhlContextForTenant, never the session's own GHL creds.

export interface CancelApptBody {
  tenantId?: string;
  eventId?: string;
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
}

// Pure, split out so it is unit-testable without a request.
export function validateCancelApptBody(body: CancelApptBody): ValidationResult {
  if (!body.tenantId || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id" };
  }
  if (!body.eventId || !body.eventId.trim()) {
    return { ok: false, code: "missing_event_id" };
  }
  return { ok: true };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<CancelApptBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateCancelApptBody(body);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const tenantId = body.tenantId!.trim();
  const eventId = body.eventId!.trim();

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const result = await cancelAppointment(gctx, eventId);
    if (!result.ok) {
      // The CRM's refusal comes back as a 502 with its own status/body so
      // the cockpit can tell the setter to cancel by hand rather than
      // silently leaving a booking the SOP says must go.
      return Response.json(
        { error: "ghl_error", status: result.status, body: result.body ?? "" },
        { status: 502 },
      );
    }

    const client = getServiceClient(ctx.env);
    if (client) {
      await logAdminAction(client, ctx.data.admin!.id, "setter.cancel_appointment", tenantId, {
        eventId,
      });
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
