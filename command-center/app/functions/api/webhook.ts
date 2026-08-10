import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../lib/env";
import { liveTenantSlug, testTenantSlug } from "../lib/env";
import { getServiceClient, resolveTenantId } from "../lib/supabase";
import { sendPushForActivity } from "../lib/push";
import { readToken, tokenMatches } from "../lib/webhookAuth";
import { tenantHasGhlCreds } from "../lib/tenantResolve";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlContext,
  type GhlOpportunity,
} from "../lib/ghl";
import {
  APP_COVERED_TYPES,
  shouldPush,
  toActivity,
  type GhlWebhookEvent,
} from "../lib/ghlEvents";
import { bumpEventSeen, eventSourceForTenant } from "../lib/ghlEventHealth";
import { insertActivityOnce } from "../lib/activityLog";
import { mirrorFromWebhook } from "../lib/appointmentMirror";

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

// ---------------------------------------------------------------------------
// Appointment confirmation -> advance the opportunity stage
//
// When GHL fires an appointment status change to "confirmed" (the intro-call
// confirm flow), advance the matching opportunity from its "awaiting
// confirmation" stage to the "confirmed" stage. This is a side effect on top of
// the normal activity logging: it does not touch the activity feed.
//
// Everything is resolved BY NAME, never by hardcoded pipeline/stage ids, so it
// works for any tenant (ids differ per sub-account). Reference stage names, from
// the wired Willis location:
//   source: Paid Ad's Pipeline "Intro Call Waiting Confirmation"
//   target: Sales Pipeline "Intro Call Confirmed"
// The source and target can live in different pipelines, so the move sets both
// pipelineId and pipelineStageId. Only the stage named ...Confirmed contains the
// token "confirmed" (the waiting / no-confirmation stages contain "confirmation",
// not "confirmed"), so a contains match on "confirmed" is unambiguous.

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

interface StageRef {
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
}

function norm(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

// Read the appointment status out of whatever shape GHL sends. Marketplace
// events nest it under `appointment`; workflow webhook actions send whatever
// custom field Jake maps. Tolerant of every plausible location; empty when none
// is present. ASSUMPTION: the confirmed value is the string "confirmed".
function appointmentStatus(e: GhlWebhookEvent): string {
  const appt = (e.appointment ?? {}) as Record<string, unknown>;
  const raw =
    e.appointmentStatus ??
    appt.appointmentStatus ??
    appt.status ??
    e.status ??
    (e.calendar as Record<string, unknown> | undefined)?.status;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function isAppointmentConfirmed(e: GhlWebhookEvent): boolean {
  return appointmentStatus(e) === "confirmed";
}

// Pull a contact id out of the event, tolerating nested shapes.
function eventContactId(e: GhlWebhookEvent): string {
  const appt = (e.appointment ?? {}) as Record<string, unknown>;
  const raw =
    e.contactId ??
    (e.contact as Record<string, unknown> | undefined)?.id ??
    appt.contactId;
  return typeof raw === "string" ? raw : "";
}

// Pull an opportunity id out of the event, tolerating nested shapes. Often
// absent on appointment payloads (appointments link to contacts, not opps), in
// which case we fall back to scanning the contact's opportunities.
function eventOpportunityId(e: GhlWebhookEvent): string {
  const raw =
    e.opportunityId ??
    (e.opportunity as Record<string, unknown> | undefined)?.id;
  return typeof raw === "string" ? raw : "";
}

function findStages(
  pipes: PipelinesResponse["pipelines"],
  pred: (normName: string) => boolean,
): StageRef[] {
  const out: StageRef[] = [];
  for (const p of pipes) {
    for (const s of p.stages ?? []) {
      if (pred(norm(s.name))) {
        out.push({
          pipelineId: p.id,
          pipelineName: p.name,
          stageId: s.id,
          stageName: s.name,
        });
      }
    }
  }
  return out;
}

// Resolve the opportunity to advance: prefer the id on the event, else scan each
// awaiting-confirmation pipeline for the contact's opportunity in that stage.
async function resolveConfirmationOpportunity(
  gctx: GhlContext,
  opportunityId: string,
  contactId: string,
  sources: StageRef[],
): Promise<GhlOpportunity | null> {
  if (opportunityId) {
    try {
      const data = await ghlJson<{ opportunity?: GhlOpportunity }>(
        gctx,
        `/opportunities/${encodeURIComponent(opportunityId)}`,
      );
      if (data.opportunity?.id) return data.opportunity;
    } catch (err) {
      console.warn(
        "[webhook] confirmation: opportunity fetch failed, scanning contact instead",
        err,
      );
    }
  }
  if (!contactId) return null;

  const sourceStageIds = new Set(sources.map((s) => s.stageId));
  const scanned = new Set<string>();
  for (const src of sources) {
    if (scanned.has(src.pipelineId)) continue;
    scanned.add(src.pipelineId);
    const opps = await fetchAllOpportunities(gctx, {
      pipelineId: src.pipelineId,
    });
    const match = opps.find(
      (o) =>
        (o.contactId === contactId || o.contact?.id === contactId) &&
        sourceStageIds.has(o.pipelineStageId ?? ""),
    );
    if (match) return match;
  }
  return null;
}

async function confirmIntroCallStage(
  gctx: GhlContext,
  event: GhlWebhookEvent,
): Promise<void> {
  const contactId = eventContactId(event);
  const opportunityId = eventOpportunityId(event);
  if (!contactId && !opportunityId) {
    console.warn(
      "[webhook] confirmation: no contactId or opportunityId; skipping",
    );
    return;
  }

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const pipes = pipeData.pipelines ?? [];

  // Target = the confirmed stage. Exact name first, then any stage whose name
  // contains "confirmed" (unambiguous, see the note above).
  const target =
    findStages(pipes, (n) => n === "intro call confirmed")[0] ??
    findStages(pipes, (n) => n.includes("confirmed"))[0];
  if (!target) {
    console.warn("[webhook] confirmation: no 'confirmed' stage found; skipping");
    return;
  }

  // Source = the awaiting-confirmation stage(s).
  const sources = findStages(pipes, (n) => n.includes("waiting confirmation"));
  if (sources.length === 0) {
    console.warn(
      "[webhook] confirmation: no 'waiting confirmation' stage found; skipping",
    );
    return;
  }
  const sourceStageIds = new Set(sources.map((s) => s.stageId));

  const opp = await resolveConfirmationOpportunity(
    gctx,
    opportunityId,
    contactId,
    sources,
  );
  if (!opp?.id) {
    console.warn("[webhook] confirmation: no matching opportunity found");
    return;
  }

  // Idempotent and safe: only advance an opportunity that is actually sitting in
  // an awaiting-confirmation stage. If it already moved (or the appointment is
  // unrelated to the intro call), leave it alone.
  if (!sourceStageIds.has(opp.pipelineStageId ?? "")) {
    console.log(
      "[webhook] confirmation: opportunity not awaiting confirmation; leaving as-is",
    );
    return;
  }
  if (opp.pipelineStageId === target.stageId) return;

  const body: Record<string, unknown> = {
    pipelineId: target.pipelineId,
    pipelineStageId: target.stageId,
  };
  if (opp.name) body.name = opp.name;
  if (opp.status) body.status = opp.status;

  await ghlJson(gctx, `/opportunities/${encodeURIComponent(opp.id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  console.log(
    `[webhook] confirmation: moved opportunity ${opp.id} -> ${target.pipelineName}/${target.stageName}`,
  );
}

// Build the GHL API context (token + location) for an event's location. Prefer
// the tenant row's own creds (true multi-tenant), fall back to the env live/test
// creds for the single-tenant / test-sub-account case. null when neither has
// usable creds, in which case the confirmation flip is skipped.
async function ghlContextForLocation(
  client: SupabaseClient,
  env: Env,
  locationId: string,
): Promise<GhlContext | null> {
  const { data } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  const row = data as
    | { ghl_location_id?: string; ghl_token?: string }
    | null;
  if (
    row &&
    tenantHasGhlCreds({
      ghl_location_id: row.ghl_location_id ?? "",
      ghl_token: row.ghl_token ?? "",
    })
  ) {
    return { token: row.ghl_token as string, locationId };
  }
  if (env.GHL_LOCATION_ID && locationId === env.GHL_LOCATION_ID && env.GHL_TOKEN) {
    return { token: env.GHL_TOKEN, locationId };
  }
  if (
    env.TEST_GHL_LOCATION_ID &&
    locationId === env.TEST_GHL_LOCATION_ID &&
    env.TEST_GHL_TOKEN
  ) {
    return { token: env.TEST_GHL_TOKEN, locationId };
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.WEBHOOK_SECRET) {
    console.error("[webhook] WEBHOOK_SECRET not configured; rejecting");
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const token = readToken(ctx.request);
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

    // Record what GHL sent BEFORE deciding what to do with it, so the health
    // board on the Connection page shows a dropped duplicate as well as a
    // processed event. Off the response path: a stale board never delays an ack.
    ctx.waitUntil(bumpEventSeen(client, tenantId, event.type ?? "unknown", "workflow"));

    // Cutover guard. Once a tenant is switched to the Marketplace app, GHL's
    // native event AND Jake's hand-built workflow both fire for the same
    // real-world change, carrying different event ids that the
    // (tenant_id, ghl_event_id) index from 0012 cannot dedupe. That is two
    // activity rows and two pushes: the client's phone buzzing twice for one
    // lead. Dropping here rather than in the app endpoint keeps the newer,
    // signed, richer payload as the one that wins.
    //
    // LeadStatusUpdate is deliberately not in APP_COVERED_TYPES: no native GHL
    // event emits Jake's 12-status cadence, so it flows through this endpoint
    // whichever source a tenant is on.
    const eventSource = await eventSourceForTenant(client, tenantId);
    if (eventSource === "app" && APP_COVERED_TYPES.has(event.type ?? "")) {
      console.log("[webhook] dropped as duplicate, tenant is on app:", event.type);
      return new Response("ok", { status: 200 });
    }

    // Put the booking in the owner's own Google Calendar. Runs on this endpoint
    // too, not just the app one, so a client still on the workflow source gets
    // the same behaviour as one already cut over.
    ctx.waitUntil(
      mirrorFromWebhook(ctx.env, client, tenantId, event).catch((err) =>
        console.error("[webhook] calendar mirror failed", err),
      ),
    );

    // Appointment confirmation side effect. A confirmation may arrive as an
    // event type the activity mapper ignores, so run this BEFORE the
    // unmapped-type early return below. Best-effort and off the response path:
    // GHL gets its 200 immediately and the GHL round-trips (pipelines lookup +
    // opportunity move) cannot delay the ack.
    if (isAppointmentConfirmed(event) && event.locationId) {
      const gctx = await ghlContextForLocation(
        client,
        ctx.env,
        event.locationId,
      );
      if (gctx) {
        ctx.waitUntil(
          confirmIntroCallStage(gctx, event).catch((err) =>
            console.error("[webhook] confirmation flip failed", err),
          ),
        );
      } else {
        console.warn(
          "[webhook] confirmation: no GHL creds for location",
          event.locationId,
        );
      }
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
