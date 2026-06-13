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

  const slug = event.locationId
    ? slugForLocation(ctx.env, event.locationId)
    : null;
  if (!slug) {
    // Authenticated but not for a location we serve (or locationId missing
    // from a workflow payload). Ack with 200 so GHL does not retry forever.
    console.warn("[webhook] unroutable locationId", event.locationId);
    return new Response("ignored", { status: 200 });
  }

  // Side effects are best-effort: record the event for the activity feed, but
  // never let a failure 500 back to GHL (it would retry and hammer us).
  try {
    const client = getServiceClient(ctx.env);
    if (client) {
      const tenantId = await resolveTenantId(client, slug);
      const activity = tenantId ? toActivity(tenantId, event) : null;

      if (!activity) {
        // Surface unknown event types once so they can be discovered and added
        // to the mapper later (GHL event names vary by version).
        console.log("[webhook] unhandled type", event.type);
      } else {
        // Map the normalized activity onto the real activity_log columns:
        // kind -> action, opportunity_id -> lead_id, and the rest into payload.
        await client.from("activity_log").insert({
          tenant_id: activity.tenant_id,
          action: activity.kind,
          lead_id: activity.opportunity_id,
          payload: {
            summary: activity.summary,
            contact_id: activity.contact_id,
            opportunity_id: activity.opportunity_id,
            raw: activity.raw,
          },
        });

        if (shouldPush(activity)) {
          // Best-effort push, off the response path: GHL gets its 200
          // immediately and slow push services cannot delay the ack. Inert
          // without VAPID keys.
          ctx.waitUntil(
            sendPushForActivity(ctx.env, activity.tenant_id, {
              kind: activity.kind,
              summary: activity.summary,
              opportunity_id: activity.opportunity_id,
              contact_id: activity.contact_id,
            }).catch((err) => console.error("[webhook] push failed", err)),
          );
        }
      }
    }
  } catch (err) {
    console.error("[webhook] side-effect failed", err);
  }

  return new Response("ok", { status: 200 });
};
