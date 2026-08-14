import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import {
  loadTenantById,
  resolveGhlCreds,
  type TenantRow,
} from "../../../../lib/tenantResolve";
import { ghlJson, type GhlContext } from "../../../../lib/ghl";
import { statusForStage, CLIENT_STATUS_ORDER } from "../../../../lib/leadStatus";
import {
  createInstallState,
  installUrl,
  loadAgencyInstall,
  loadInstall,
  locationToken,
} from "../../../../lib/ghlApp";
import { provisionLocation } from "../../../../lib/ghlProvision";
import { APP_COVERED_TYPES } from "../../../../lib/ghlEvents";

// GET  /api/admin/clients/:tenantId/crm-connection
// POST /api/admin/clients/:tenantId/crm-connection  { action: ... }
//
// NO UI READS THIS. The Fulfillment > GHL > Connection panel it was written for
// was removed: the Marketplace app half of it was dead (GHL_APP_CLIENT_ID and
// GHL_APP_CLIENT_SECRET are set nowhere), and connecting a client is now the
// Connect wizard's whole job. The route survives because two of its writes are
// not: `stage-map` fills ghl_stage_map, which the Paid Ads lead tracker reads,
// and `provision` installs the webhook wiring into a location. Both are
// reachable by hand until they are re-homed on a screen that earns them.
//
// Admin only, enforced upstream in _middleware.ts.
//
// It answers four questions: is the app installed, are events actually
// arriving, do their stages map onto the status model, and is the client cut
// over yet.

// The 19 events the Marketplace app is subscribed to, in the order they are
// listed in the developer portal. Anything arriving that is NOT in this list
// shows up on the board as an extra, which is how you discover GHL added an
// event type without telling anybody.
const EXPECTED_EVENTS: { group: string; type: string }[] = [
  { group: "Opportunity", type: "OpportunityCreate" },
  { group: "Opportunity", type: "OpportunityUpdate" },
  { group: "Opportunity", type: "OpportunityDelete" },
  { group: "Opportunity", type: "OpportunityStageUpdate" },
  { group: "Opportunity", type: "OpportunityStatusUpdate" },
  { group: "Opportunity", type: "OpportunityAssignedToUpdate" },
  { group: "Contact", type: "ContactCreate" },
  { group: "Contact", type: "ContactUpdate" },
  { group: "Contact", type: "ContactDelete" },
  { group: "Contact", type: "ContactTagUpdate" },
  { group: "Appointment", type: "AppointmentCreate" },
  { group: "Appointment", type: "AppointmentUpdate" },
  { group: "Appointment", type: "AppointmentDelete" },
  { group: "Invoice", type: "InvoiceCreate" },
  { group: "Invoice", type: "InvoiceSent" },
  { group: "Invoice", type: "InvoicePaid" },
  { group: "Invoice", type: "InvoiceVoid" },
  { group: "Conversation", type: "InboundMessage" },
  { group: "Conversation", type: "OutboundMessage" },
];

interface SeenRow {
  event_type: string;
  source: string;
  last_seen_at: string;
  total: number;
}

interface StageOverrideRow {
  pipeline_id: string;
  stage_id: string;
  lead_status: string;
}

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

// A GHL context for this client, preferring the Marketplace app token and
// falling back to the Private Integration Token from onboarding.
//
// The fallback is what lets the stage map work on day one, before anything is
// installed. It is also why installing the app cannot break a client: if the
// app path yields nothing, every read here behaves exactly as it did before.
async function contextFor(
  client: SupabaseClient,
  env: Env,
  tenant: TenantRow,
): Promise<{ gctx: GhlContext; via: "app" | "token" } | null> {
  const locationId = String(tenant.ghl_location_id ?? "");
  if (locationId) {
    const appToken = await locationToken(client, env, locationId);
    if (appToken) return { gctx: { token: appToken, locationId }, via: "app" };
  }
  const creds = resolveGhlCreds(tenant);
  if (creds) {
    return { gctx: { token: creds.token, locationId: creds.locationId }, via: "token" };
  }
  return null;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const locationId = String(tenant.ghl_location_id ?? "");
  const origin = new URL(ctx.request.url).origin;

  // --- install -------------------------------------------------------------
  const agency = await loadAgencyInstall(client);
  const locationRow = agency
    ? await loadInstall(client, agency.company_id, locationId)
    : null;

  let url: string | null = null;
  try {
    const base = installUrl(ctx.env, origin);
    // The state expires in 15 minutes, which is why it is minted per page load
    // rather than stored. Reloading the page issues a fresh one.
    if (base) url = `${base}&state=${encodeURIComponent(await createInstallState(ctx.env))}`;
  } catch {
    url = null; // app not configured; the panel says so rather than linking nowhere
  }

  // --- events --------------------------------------------------------------
  const { data: seenRows } = await client
    .from("ghl_event_seen")
    .select("event_type, source, last_seen_at, total")
    .eq("tenant_id", tenantId);
  const seen = (seenRows ?? []) as SeenRow[];
  const seenFor = (type: string, source: string) =>
    seen.find((r) => r.event_type === type && r.source === source) ?? null;

  const events = EXPECTED_EVENTS.map((e) => ({
    ...e,
    // Whether switching this tenant to 'app' silences the legacy webhook for
    // this type. Shown on the board so a red row next to a covered type reads
    // as "this will go quiet at cutover", not as a fault.
    appCovered: APP_COVERED_TYPES.has(e.type),
    app: seenFor(e.type, "app"),
    workflow: seenFor(e.type, "workflow"),
  }));

  // Anything GHL sent that is not on the expected list.
  const expectedTypes = new Set(EXPECTED_EVENTS.map((e) => e.type));
  const extras = seen.filter((r) => !expectedTypes.has(r.event_type));

  // --- stages --------------------------------------------------------------
  const { data: overrideRows } = await client
    .from("ghl_stage_map")
    .select("pipeline_id, stage_id, lead_status")
    .eq("tenant_id", tenantId);
  const overrides = (overrideRows ?? []) as StageOverrideRow[];

  let pipelines: unknown[] = [];
  let stagesError: string | null = null;
  const conn = await contextFor(client, ctx.env, tenant);
  if (!conn) {
    stagesError = "not connected";
  } else {
    try {
      const data = await ghlJson<PipelinesResponse>(
        conn.gctx,
        `/opportunities/pipelines?locationId=${encodeURIComponent(conn.gctx.locationId)}`,
      );
      pipelines = (data.pipelines ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        stages: (p.stages ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          // What lib/leadStatus.ts derives from the NAME today. This is the
          // live behaviour, so a stage showing the right status here needs no
          // override at all.
          derived: statusForStage(s.name),
          override:
            overrides.find((o) => o.pipeline_id === p.id && o.stage_id === s.id)
              ?.lead_status ?? null,
        })),
      }));
    } catch (err) {
      stagesError = (err as Error).message;
    }
  }

  // --- the workflows that stay yours ---------------------------------------
  // No native GHL event emits Jake's 12-status cadence, so LeadStatusUpdate can
  // only ever come from a hand-built workflow. Rather than a checklist somebody
  // has to tick, this reports the statuses that have ACTUALLY arrived, which is
  // the only honest way to know whether a workflow exists and fires.
  const { data: statusRows } = await client
    .from("activity_log")
    .select("payload, created_at")
    .eq("tenant_id", tenantId)
    .in("action", ["stage_changed", "status_changed"])
    .order("created_at", { ascending: false })
    .limit(500);

  const statusSeen = new Map<string, string>();
  for (const row of (statusRows ?? []) as { payload: Record<string, unknown>; created_at: string }[]) {
    const summary = String(row.payload?.summary ?? "").trim();
    if (summary && !statusSeen.has(summary)) statusSeen.set(summary, row.created_at);
  }

  return Response.json({
    locationId,
    source: tenant.ghl_event_source === "app" ? "app" : "workflow",
    install: {
      configured: Boolean(url),
      agencyInstalled: Boolean(agency),
      companyId: agency?.company_id ?? null,
      installedAt: locationRow?.installed_at ?? agency?.installed_at ?? null,
      revokedAt: locationRow?.revoked_at ?? null,
      scopes: agency?.scopes ?? null,
      url,
    },
    events,
    extras,
    stages: { pipelines, error: stagesError, via: conn?.via ?? null },
    statuses: [...statusSeen.entries()].map(([summary, lastSeenAt]) => ({
      summary,
      lastSeenAt,
    })),
    statusModel: CLIENT_STATUS_ORDER,
  });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "source") {
    const value = body.value === "app" ? "app" : "workflow";
    const { error } = await client
      .from("tenants")
      .update({ ghl_event_source: value })
      .eq("id", tenantId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, source: value });
  }

  if (action === "stage-map") {
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const valid = new Set<string>(CLIENT_STATUS_ORDER);

    // An entry with no status is a REMOVED override, not an error: clearing the
    // dropdown must put the stage back on name matching rather than pinning it
    // to whatever it happened to derive at the time.
    const toDelete = entries.filter(
      (e) => !(e as Record<string, unknown>).lead_status,
    ) as Record<string, string>[];
    const toUpsert = (entries as Record<string, string>[]).filter(
      (e) => e.lead_status && valid.has(e.lead_status),
    );

    for (const e of toDelete) {
      await client
        .from("ghl_stage_map")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("pipeline_id", e.pipeline_id)
        .eq("stage_id", e.stage_id);
    }

    if (toUpsert.length) {
      const { error } = await client.from("ghl_stage_map").upsert(
        toUpsert.map((e) => ({
          tenant_id: tenantId,
          pipeline_id: e.pipeline_id,
          stage_id: e.stage_id,
          pipeline_name: e.pipeline_name ?? null,
          stage_name: e.stage_name ?? null,
          lead_status: e.lead_status,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "tenant_id,pipeline_id,stage_id" },
      );
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true, saved: toUpsert.length, removed: toDelete.length });
  }

  if (action === "provision") {
    const conn = await contextFor(client, ctx.env, tenant);
    if (!conn) return Response.json({ error: "not connected" }, { status: 503 });

    const secret = (ctx.env.WEBHOOK_SECRET ?? "").trim();
    if (!secret) {
      return Response.json({ error: "WEBHOOK_SECRET not configured" }, { status: 503 });
    }
    const origin = new URL(ctx.request.url).origin;
    const items = await provisionLocation(
      conn.gctx,
      `${origin}/api/webhook?token=${encodeURIComponent(secret)}`,
    );
    return Response.json({ ok: true, items });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
};
