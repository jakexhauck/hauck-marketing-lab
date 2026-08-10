import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { sendPushForActivity } from "../../lib/push";
import { verifyWebhookSignature } from "../../lib/ghlApp";
import { insertActivityOnce } from "../../lib/activityLog";
import { bumpEventSeen, eventSourceForTenant } from "../../lib/ghlEventHealth";
import { mirrorFromWebhook } from "../../lib/appointmentMirror";
import {
  appEventId,
  normalizeAppEvent,
  shouldPush,
  toActivity,
  type GhlWebhookEvent,
} from "../../lib/ghlEvents";

// POST /api/crm/app-webhook
//
// Every native event from the GoHighLevel Marketplace app, for every installed
// sub-account, arrives here. One URL, all locations, no per-client wiring: this
// endpoint is the entire point of the app.
//
// Auth is a real signature, unlike /api/webhook (which authenticates with a
// shared secret in the URL because a workflow's Webhook action cannot sign
// anything). GHL signs the raw body with Ed25519 and sends it as
// X-GHL-Signature. The older RSA X-WH-Signature header is deprecated on
// 1 September 2026 and is not accepted here.
//
// Fail closed: an unverifiable body is rejected, never processed.
//
// A tenant only has its events PROCESSED once it is switched to the 'app'
// source on the Connection page. Before that, events are recorded on the health
// board and otherwise dropped, so you can watch the app deliver for a day
// before cutting a live client over. Without that, both sources would write a
// row and fire a push for the same change and the client's phone would buzz
// twice for one lead.

interface AppEvent extends GhlWebhookEvent {
  companyId?: string;
  appId?: string;
}

// The app's own lifecycle events, which carry no business meaning but tell the
// Connection page whether a client is covered.
const INSTALL_TYPES = new Set(["INSTALL", "AppInstall", "Install"]);
const UNINSTALL_TYPES = new Set(["UNINSTALL", "AppUninstall", "Uninstall"]);

async function markRevoked(
  client: SupabaseClient,
  companyId: string,
  locationId: string,
): Promise<void> {
  if (!locationId) return;
  const { error } = await client
    .from("ghl_installs")
    .update({ revoked_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("location_id", locationId);
  if (error) console.warn("[crm] marking uninstall failed:", error.message);
}

async function tenantIdForLocation(
  client: SupabaseClient,
  locationId: string,
): Promise<string | null> {
  // Only ONE tenant may hold a location. The .maybeSingle() is load-bearing:
  // two rows claiming the same location makes this return null and the event
  // vanishes, which is preferable to routing a client's data to the wrong app.
  const { data } = await client
    .from("tenants")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // The signature is over exactly the bytes GHL sent, so read the body once as
  // an ArrayBuffer and parse from that. Reading it as JSON first and
  // re-serialising would verify a different payload.
  const raw = await ctx.request.arrayBuffer();
  const signature = ctx.request.headers.get("x-ghl-signature") ?? "";

  if (!(await verifyWebhookSignature(raw, signature))) {
    console.warn("[crm] rejected: bad or missing signature");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let event: AppEvent;
  try {
    event = JSON.parse(new TextDecoder().decode(raw)) as AppEvent;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const type = typeof event.type === "string" ? event.type : "";
  const locationId = typeof event.locationId === "string" ? event.locationId : "";
  console.log("[crm]", type || "unknown", "location:", locationId || "none");

  // Everything below is best-effort. Never 500 back to GHL: it retries, and a
  // retry storm on a broken normalizer is worse than a missing feed row.
  try {
    const client = getServiceClient(ctx.env);
    if (!client) return new Response("ignored", { status: 200 });

    // Install lifecycle first: these arrive for locations that may not be a
    // tenant yet, so they must not depend on tenant resolution.
    if (UNINSTALL_TYPES.has(type)) {
      await markRevoked(client, event.companyId ?? "", locationId);
      return new Response("ok", { status: 200 });
    }
    if (INSTALL_TYPES.has(type)) {
      // Nothing to store. The agency token already covers this location and a
      // sub-account token is minted on first use; writing a half-row here would
      // just be a second source of truth about whether a client is connected.
      console.log("[crm] app installed on location", locationId);
      return new Response("ok", { status: 200 });
    }

    if (!locationId) return new Response("ignored", { status: 200 });

    const tenantId = await tenantIdForLocation(client, locationId);
    if (!tenantId) {
      // Installed on a sub-account we do not serve, or one onboarded in GHL
      // before it exists in the Command Center. Ack so GHL stops retrying.
      console.warn("[crm] unroutable locationId", locationId);
      return new Response("ignored", { status: 200 });
    }

    // Record every arrival, including types the normalizer ignores. An event
    // type arriving and being dropped must not look identical to one that never
    // arrived: that distinction is the whole value of the health board.
    ctx.waitUntil(bumpEventSeen(client, tenantId, type || "unknown", "app"));

    // The cutover gate. Until an operator flips this tenant to 'app', the
    // hand-built workflows are still the live source and this endpoint is only
    // proving itself on the board.
    const source = await eventSourceForTenant(client, tenantId);
    if (source !== "app") return new Response("ok", { status: 200 });

    // Put the booking in the owner's own Google Calendar. Off the response path
    // and best effort: a Composio hiccup must not make GHL retry a webhook we
    // have already recorded.
    ctx.waitUntil(
      mirrorFromWebhook(ctx.env, client, tenantId, event).catch((err) =>
        console.error("[crm] calendar mirror failed", err),
      ),
    );

    // Marketplace payloads name the subject `id`, not `opportunityId` or
    // `contactId`. Feeding one straight into toActivity writes a row with a
    // null lead_id, which renders as a lead the client cannot open.
    const normalized = normalizeAppEvent(event);
    const activity = toActivity(tenantId, normalized);
    if (!activity) {
      console.log("[crm] unhandled type", type);
      return new Response("ok", { status: 200 });
    }

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
          source: "app",
          raw: activity.raw,
        },
      },
      appEventId(normalized),
    );

    if (inserted && shouldPush(activity)) {
      ctx.waitUntil(
        sendPushForActivity(ctx.env, activity.tenant_id, {
          kind: activity.kind,
          summary: activity.summary,
          opportunity_id: activity.opportunity_id,
          contact_id: activity.contact_id,
          assigned_user_id: activity.assigned_user_id,
        }).catch((err) => console.error("[crm] push failed", err)),
      );
    }
  } catch (err) {
    console.error("[crm] side-effect failed", err);
  }

  return new Response("ok", { status: 200 });
};
