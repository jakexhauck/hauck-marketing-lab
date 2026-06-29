import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { syncNotifyPrefsToGhl } from "../../lib/ghlNotifyPrefs";

// Per-tenant notification settings, set by the owner. Covers two things:
//
//   audience (0011)  -> who is woken by push: 'everyone' | 'assigned'.
//   channels (0021)  -> which channels fire at all: push / email / sms, plus the
//                       single email destination the owner picks.
//
// Push is ours (webhook fan-out). Email and SMS are sent by the GHL snapshot,
// so flipping email/sms here also mirrors the choice into GHL (best-effort) so
// the workflows can gate on it. GET is readable by any signed-in member so the
// UI can render the current state; PATCH is owner-only.

type Audience = "everyone" | "assigned";

interface Settings {
  audience: Audience;
  push: boolean;
  email: boolean;
  sms: boolean;
  emailTo: string | null;
  smsTo: string | null;
}

interface TenantRow {
  notify_audience?: string | null;
  notify_push_enabled?: boolean | null;
  notify_email_enabled?: boolean | null;
  notify_sms_enabled?: boolean | null;
  notify_email_to?: string | null;
  notify_sms_to?: string | null;
}

function shape(row: TenantRow | null): Settings {
  return {
    audience: row?.notify_audience === "assigned" ? "assigned" : "everyone",
    push: row?.notify_push_enabled !== false,
    email: row?.notify_email_enabled !== false,
    sms: row?.notify_sms_enabled === true,
    emailTo: row?.notify_email_to?.trim() || null,
    smsTo: row?.notify_sms_to?.trim() || null,
  };
}

const DEFAULTS: Settings = {
  audience: "everyone",
  push: true,
  email: true,
  sms: false,
  emailTo: null,
  smsTo: null,
};

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json(DEFAULTS);

  const { data } = await client
    .from("tenants")
    .select(
      "notify_audience, notify_push_enabled, notify_email_enabled, notify_sms_enabled, notify_email_to, notify_sms_to",
    )
    .eq("slug", ctx.data.tenant.slug)
    .maybeSingle();

  return Response.json(shape(data as TenantRow | null));
};

interface PatchBody {
  audience?: unknown;
  push?: unknown;
  email?: unknown;
  sms?: unknown;
  emailTo?: unknown;
  smsTo?: unknown;
}

// A minimal RFC-ish email check: non-empty, single @, a dot in the domain. The
// GHL side is the real validator; this just stops obvious garbage being stored
// as the destination.
function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Loose phone check: at least 7 digits once symbols are stripped. GHL validates
// the real format; this only blocks obvious junk.
function validPhone(value: string): boolean {
  return (value.match(/\d/g)?.length ?? 0) >= 7;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  // Channel + audience rules govern the whole team's alerts: owner only.
  if (ctx.data.isOwner !== true) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.audience !== undefined) {
    if (body.audience !== "everyone" && body.audience !== "assigned") {
      return Response.json({ error: "invalid_audience" }, { status: 400 });
    }
    update.notify_audience = body.audience;
  }
  if (body.push !== undefined) {
    if (typeof body.push !== "boolean")
      return Response.json({ error: "invalid_push" }, { status: 400 });
    update.notify_push_enabled = body.push;
  }
  if (body.email !== undefined) {
    if (typeof body.email !== "boolean")
      return Response.json({ error: "invalid_email" }, { status: 400 });
    update.notify_email_enabled = body.email;
  }
  if (body.sms !== undefined) {
    if (typeof body.sms !== "boolean")
      return Response.json({ error: "invalid_sms" }, { status: 400 });
    update.notify_sms_enabled = body.sms;
  }
  if (body.emailTo !== undefined) {
    if (body.emailTo === null || body.emailTo === "") {
      update.notify_email_to = null;
    } else if (typeof body.emailTo === "string" && validEmail(body.emailTo.trim())) {
      update.notify_email_to = body.emailTo.trim();
    } else {
      return Response.json({ error: "invalid_email_to" }, { status: 400 });
    }
  }
  if (body.smsTo !== undefined) {
    if (body.smsTo === null || body.smsTo === "") {
      update.notify_sms_to = null;
    } else if (typeof body.smsTo === "string" && validPhone(body.smsTo.trim())) {
      update.notify_sms_to = body.smsTo.trim();
    } else {
      return Response.json({ error: "invalid_sms_to" }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }

  const { data, error } = await client
    .from("tenants")
    .update(update)
    .eq("id", tenantId)
    .select(
      "notify_audience, notify_push_enabled, notify_email_enabled, notify_sms_enabled, notify_email_to, notify_sms_to, ghl_location_id, ghl_token",
    )
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const next = shape(data as TenantRow | null);

  // Mirror the email/sms recipients into GHL (set when on, blank when off) so the
  // snapshot's internal_notification actions obey the switches. Best-effort:
  // never blocks or fails the save (the app row is the source of truth; GHL sync
  // is reconciled separately on failure).
  if (
    body.email !== undefined ||
    body.sms !== undefined ||
    body.emailTo !== undefined ||
    body.smsTo !== undefined
  ) {
    const row = data as (TenantRow & { ghl_location_id?: string; ghl_token?: string }) | null;
    ctx.waitUntil(
      syncNotifyPrefsToGhl({
        locationId: row?.ghl_location_id ?? "",
        token: row?.ghl_token ?? "",
        emailEnabled: next.email,
        smsEnabled: next.sms,
        emailTo: next.emailTo,
        smsNumber: next.smsTo,
      }).catch(() => {}),
    );
  }

  return Response.json(next);
};
