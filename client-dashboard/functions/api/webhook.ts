import type { Env } from "../lib/env";
import { getServiceClient, resolveTenantId } from "../lib/supabase";
import { sendPushForActivity } from "../lib/push";

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

interface GhlWebhookEvent {
  type?: string;
  locationId?: string;
  id?: string;
  contactId?: string;
  opportunityId?: string;
  pipelineStageId?: string;
  [k: string]: unknown;
}

// Normalized activity, illustrative shape from the plan. It is mapped onto the
// real activity_log columns (action, lead_id, payload) at insert time below.
type ActivityKind =
  | "lead_created"
  | "stage_changed"
  | "message_in"
  | "message_out";

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
    case "InboundMessage":
      return mk("message_in", "Inbound message", tenantId, e);
    case "OutboundMessage":
      return mk("message_out", "Outbound message", tenantId, e);
    default:
      return null; // ignore everything else
  }
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const raw = await ctx.request.text();
  const signature =
    ctx.request.headers.get("x-ghl-signature") ||
    ctx.request.headers.get("x-webhook-signature") ||
    "";

  if (ctx.env.WEBHOOK_SECRET) {
    const expected = await hmacHex(ctx.env.WEBHOOK_SECRET, raw);
    if (!timingSafeEqual(expected, signature.toLowerCase())) {
      console.warn("[webhook] signature mismatch");
    }
  }

  let event: GhlWebhookEvent = {};
  try {
    event = JSON.parse(raw);
  } catch {
    console.warn("[webhook] non-json body");
  }

  console.log(
    "[webhook]",
    event.type ?? "unknown",
    "location:",
    event.locationId ?? "none",
  );

  // Side effects are best-effort: record the event for the activity feed, but
  // never let a failure 500 back to GHL (it would retry and hammer us).
  try {
    const client = getServiceClient(ctx.env);
    if (client) {
      const tenantId = await resolveTenantId(client, "test-account");
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

        if (
          activity &&
          (activity.kind === "message_in" || activity.kind === "lead_created")
        ) {
          // Best-effort push. Already inside the webhook try/catch, so a push
          // failure never breaks the 200 we owe GHL. Inert without VAPID keys.
          await sendPushForActivity(ctx.env, {
            kind: activity.kind,
            summary: activity.summary,
            opportunity_id: activity.opportunity_id,
            contact_id: activity.contact_id,
          });
        }
      }
    }
  } catch (err) {
    console.error("[webhook] side-effect failed", err);
  }

  return new Response("ok", { status: 200 });
};
