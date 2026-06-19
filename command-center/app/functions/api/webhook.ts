import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../lib/env";
import { liveTenantSlug, testTenantSlug } from "../lib/env";
import { getServiceClient, resolveTenantId } from "../lib/supabase";
import { sendPushForActivity } from "../lib/push";

// Auth model: GHL cannot produce a signature we can verify here (marketplace
// webhooks sign with an RSA key under x-wh-signature; workflow webhook actions
// send no signature at all), so the endpoint authenticates with a shared
// secret embedded in the webhook URL instead:
//   https://<host>/api/webhook?token=<WEBHOOK_SECRET>
// (or an x-webhook-token header). Configure the same value in the GHL webhook
// URL and in the WEBHOOK_SECRET env var. Fail closed: without the env var, or
// without a matching token, nothing is processed.
//
// Workflow webhook actions must also include locationId in their custom
// payload (plus type/contactId/opportunityId) or the event is ignored: tenant
// routing is by event.locationId, never by a hardcoded tenant.

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

// Compare digests, not raw strings, so neither length nor prefix leaks timing.
async function tokenMatches(supplied: string, secret: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(supplied), sha256(secret)]);
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

interface GhlWebhookEvent {
  type?: string;
  locationId?: string;
  id?: string;
  contactId?: string;
  opportunityId?: string;
  // GHL user id the opportunity is assigned to. Drives "assigned rep only"
  // push routing; absent on events with no assignee (e.g. inbound messages).
  assignedTo?: string;
  [k: string]: unknown;
}

// Normalized activity, illustrative shape from the plan. It is mapped onto the
// real activity_log columns (action, lead_id, payload) at insert time below.
type ActivityKind =
  | "lead_created"
  | "stage_changed"
  | "status_changed"
  | "message_in"
  | "message_out"
  | "appointment_create"
  | "appointment_update"
  | "appointment_delete"
  | "invoice_create"
  | "invoice_sent"
  | "invoice_paid";

interface Activity {
  tenant_id: string;
  kind: ActivityKind;
  contact_id: string | null;
  opportunity_id: string | null;
  // GHL user the lead is assigned to, when the event carries one. Used to route
  // "assigned rep only" pushes; null leaves the fan-out to fall back to everyone.
  assigned_user_id: string | null;
  summary: string;
  raw: unknown;
}

function mk(
  kind: ActivityKind,
  summary: string,
  tenantId: string,
  e: GhlWebhookEvent,
): Activity {
  return {
    tenant_id: tenantId,
    kind,
    contact_id: e.contactId ?? null,
    opportunity_id: e.opportunityId ?? null,
    assigned_user_id:
      typeof e.assignedTo === "string" && e.assignedTo ? e.assignedTo : null,
    summary,
    raw: e,
  };
}

function toActivity(tenantId: string, e: GhlWebhookEvent): Activity | null {
  switch (e.type) {
    case "OpportunityCreate":
      return mk("lead_created", "New lead", tenantId, e);
    case "OpportunityStageUpdate":
      return mk("stage_changed", "Stage changed", tenantId, e);
    case "OpportunityStatusUpdate": {
      // Derive a readable summary when the payload carries the new status.
      const status = typeof e.status === "string" ? e.status.toLowerCase() : "";
      const summary =
        status === "won"
          ? "Lead won"
          : status === "lost"
            ? "Lead lost"
            : "Lead status changed";
      return mk("status_changed", summary, tenantId, e);
    }
    case "AppointmentCreate":
      return mk("appointment_create", "Appointment booked", tenantId, e);
    case "AppointmentUpdate":
      return mk("appointment_update", "Appointment updated", tenantId, e);
    case "AppointmentDelete":
      return mk("appointment_delete", "Appointment cancelled", tenantId, e);
    case "InvoiceCreate":
      return mk("invoice_create", "Invoice created", tenantId, e);
    case "InvoiceSent":
      return mk("invoice_sent", "Invoice sent", tenantId, e);
    case "InvoicePaid":
      return mk("invoice_paid", "Invoice paid", tenantId, e);
    case "InboundMessage":
      return mk("message_in", "Inbound message", tenantId, e);
    case "OutboundMessage":
      return mk("message_out", "Outbound message", tenantId, e);
    default:
      return null; // ignore everything else
  }
}

// Kinds that wake the client's phone. Wins and new appointments matter as
// much as new leads; routine updates and outbound traffic do not.
function shouldPush(activity: Activity): boolean {
  if (activity.kind === "message_in" || activity.kind === "lead_created") {
    return true;
  }
  if (activity.kind === "appointment_create") return true;
  return activity.kind === "status_changed" && activity.summary === "Lead won";
}

// Map a GHL location id to the Supabase tenant slug it belongs to. Only the
// two locations this deploy is configured for are routable; events from any
// other location are dropped.
function slugForLocation(env: Env, locationId: string): string | null {
  if (env.GHL_LOCATION_ID && locationId === env.GHL_LOCATION_ID) {
    return liveTenantSlug(env);
  }
  if (env.TEST_GHL_LOCATION_ID && locationId === env.TEST_GHL_LOCATION_ID) {
    return testTenantSlug(env);
  }
  return null;
}

// Resolve the tenant id for an inbound event's GHL location. Prefer a DB tenant
// whose ghl_location_id matches (true multi-tenant: every client's events route,
// not just the single env-configured one) and fall back to the env live/test
// locations for the single-tenant / test-sub-account case. null when nothing
// matches.
async function tenantIdForLocation(
  client: SupabaseClient,
  env: Env,
  locationId: string,
): Promise<string | null> {
  const { data } = await client
    .from("tenants")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  if (data?.id) return data.id as string;

  const slug = slugForLocation(env, locationId);
  return slug ? await resolveTenantId(client, slug) : null;
}

// Insert one activity_log row, idempotently when a GHL event id is present.
// Returns true only when a NEW row was created, so the caller pushes exactly
// once even if GHL retries. Dedup relies on the unique (tenant_id, ghl_event_id)
// index from migration 0012; if that column/index is not present yet the upsert
// errors and we fall back to a plain insert (the prior behaviour), so the
// webhook never breaks on an un-migrated database.
async function insertActivityOnce(
  client: SupabaseClient,
  row: Record<string, unknown>,
  eventId: string | null,
): Promise<boolean> {
  if (eventId) {
    const { data, error } = await client
      .from("activity_log")
      .upsert(
        { ...row, ghl_event_id: eventId },
        { onConflict: "tenant_id,ghl_event_id", ignoreDuplicates: true },
      )
      .select("id");
    if (!error) {
      // ignoreDuplicates => an already-seen event returns no rows.
      return Array.isArray(data) && data.length > 0;
    }
    console.warn(
      "[webhook] idempotent insert unavailable, falling back to plain insert:",
      error.message,
    );
  }
  const { error } = await client.from("activity_log").insert(row);
  if (error) {
    console.error("[webhook] activity insert failed", error.message);
    return false;
  }
  return true;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.WEBHOOK_SECRET) {
    console.error("[webhook] WEBHOOK_SECRET not configured; rejecting");
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const url = new URL(ctx.request.url);
  const token =
    url.searchParams.get("token") ||
    ctx.request.headers.get("x-webhook-token") ||
    "";
  if (!token || !(await tokenMatches(token, ctx.env.WEBHOOK_SECRET))) {
    console.warn("[webhook] rejected: bad or missing token");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let event: GhlWebhookEvent;
  try {
    event = (await ctx.request.json()) as GhlWebhookEvent;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  console.log(
    "[webhook]",
    event.type ?? "unknown",
    "location:",
    event.locationId ?? "none",
  );

  // Resolve which tenant this event belongs to and record it for the activity
  // feed. All best-effort: never 500 back to GHL (it would retry and hammer us),
  // so failures are logged and we still ack 200.
  try {
    const client = getServiceClient(ctx.env);
    if (!client) {
      // Nothing to persist without Supabase; ack so GHL stops retrying.
      return new Response("ignored", { status: 200 });
    }

    const tenantId = event.locationId
      ? await tenantIdForLocation(client, ctx.env, event.locationId)
      : null;
    if (!tenantId) {
      // Authenticated but not for a location we serve (or locationId missing
      // from a workflow payload). Ack with 200 so GHL does not retry forever.
      console.warn("[webhook] unroutable locationId", event.locationId);
      return new Response("ignored", { status: 200 });
    }

    const activity = toActivity(tenantId, event);
    if (!activity) {
      // Surface unknown event types once so they can be discovered and added to
      // the mapper later (GHL event names vary by version).
      console.log("[webhook] unhandled type", event.type);
      return new Response("ok", { status: 200 });
    }

    // Map the normalized activity onto the real activity_log columns: kind ->
    // action, opportunity_id -> lead_id, the rest into payload. Insert
    // idempotently on the GHL event id so a retry does not duplicate the feed
    // row or the push; only push when a NEW row was actually written.
    const eventId = typeof event.id === "string" && event.id ? event.id : null;
    const inserted = await insertActivityOnce(
      client,
      {
        tenant_id: activity.tenant_id,
        action: activity.kind,
        lead_id: activity.opportunity_id,
        payload: {
          summary: activity.summary,
          contact_id: activity.contact_id,
          opportunity_id: activity.opportunity_id,
          raw: activity.raw,
        },
      },
      eventId,
    );

    if (inserted && shouldPush(activity)) {
      // Best-effort push, off the response path: GHL gets its 200 immediately
      // and slow push services cannot delay the ack. Inert without VAPID keys.
      ctx.waitUntil(
        sendPushForActivity(ctx.env, activity.tenant_id, {
          kind: activity.kind,
          summary: activity.summary,
          opportunity_id: activity.opportunity_id,
          contact_id: activity.contact_id,
          assigned_user_id: activity.assigned_user_id,
        }).catch((err) => console.error("[webhook] push failed", err)),
      );
    }
  } catch (err) {
    console.error("[webhook] side-effect failed", err);
  }

  return new Response("ok", { status: 200 });
};
