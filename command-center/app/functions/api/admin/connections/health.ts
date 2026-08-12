import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { ghlFetch } from "../../../lib/ghl";
import { isConnected, getAccessToken, DriveNotConnectedError } from "../../../lib/driveDirect";
import { parseServiceAccount } from "../../../lib/ga4";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { CONNECTIONS } from "../../../../src/lib/connectionRegistry";
import { HEALTH_CRON_HEADER, isHealthCronRequest } from "../../../lib/healthCron";
import { recordAndAlert } from "../../../lib/healthWatch";
import type {
  Probe,
  CredentialState,
  ConnectionHealth,
  ClientConnectionHealth,
  HealthResponse,
} from "../../../../src/lib/connectionHealth";

// GET /api/admin/connections/health  (admin-only, gated in _middleware.ts)
//
// The probe behind the admin control room. For every connection in the registry
// it reports two separable things, because conflating them is what makes a
// status page lie:
//
//   configured: are the credentials present at all?
//   probe:      does the credential still work against the live vendor?
//
// A credential can be present and dead (revoked token) or absent and irrelevant
// (optional). Both states are reported plainly rather than flattened into one
// misleading green dot. Where a live probe would be expensive or where the exact
// vendor endpoint is unverified, the probe reports "skipped" with the reason
// instead of guessing, because a wrong probe is worse than no probe.
//
// Designed to be callable by a scheduled job, not just by the page: it takes no
// parameters, is read-only, and returns a flat comparable snapshot. Cloudflare
// Pages has no cron trigger, so the scheduler will be an external caller.

// Types live in src/lib/connectionHealth.ts so this endpoint and the page that
// renders it can never disagree about the shape.

const PROBE_TIMEOUT_MS = 6000;

function timeout(): AbortSignal {
  return AbortSignal.timeout(PROBE_TIMEOUT_MS);
}

/** Reduce any thrown probe error to one readable line. */
function failure(e: unknown): Probe {
  const msg = e instanceof Error ? e.message : String(e);
  return { state: "failed", detail: msg.slice(0, 200) };
}

// Cloudflare env vars are the only credentials readable synchronously. Anything
// held in Supabase or by a vendor is resolved by its own probe below.
function envPresence(env: Env, name: string): boolean {
  const raw = (env as unknown as Record<string, unknown>)[name];
  return typeof raw === "string" ? raw.trim().length > 0 : raw != null;
}

async function probeSupabase(env: Env): Promise<Probe> {
  const client = getServiceClient(env);
  if (!client) return { state: "failed", detail: "Supabase env vars are not set" };
  const { error } = await client.from("tenants").select("id").limit(1);
  if (error) return { state: "failed", detail: error.message };
  return { state: "ok", detail: "Query returned" };
}

async function probeMeta(env: Env): Promise<Probe> {
  const token = env.META_SYSTEM_USER_TOKEN;
  if (!token) return { state: "skipped", detail: "No token set" };
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me?fields=id&access_token=${encodeURIComponent(token)}`,
    { signal: timeout() },
  );
  if (res.ok) return { state: "ok", detail: "Token accepted by Meta" };
  const body = (await res.text()).slice(0, 160);
  return { state: "failed", detail: `Meta returned ${res.status}: ${body}` };
}

async function probeGithub(env: Env): Promise<Probe> {
  const token = env.GITHUB_TOKEN;
  if (!token) return { state: "skipped", detail: "No token set" };
  const repo = env.GITHUB_REPO || "jakexhauck/hauck-marketing-lab";
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hauck-command-center",
    },
    signal: timeout(),
  });
  if (!res.ok) return { state: "failed", detail: `GitHub returned ${res.status}` };
  // Fine-grained tokens carry their own expiry date in a response header. This
  // is the only credential in the estate with a hard clock, so surface it.
  const expiry = res.headers.get("github-authentication-token-expiration");
  return {
    state: "ok",
    detail: expiry ? `Repo readable. Token expires ${expiry}` : "Repo readable",
  };
}

async function probeDrive(env: Env): Promise<Probe> {
  const client = getServiceClient(env);
  if (!client) return { state: "skipped", detail: "Supabase not configured" };
  const { connected, email } = await isConnected(client);
  if (!connected) return { state: "failed", detail: "No refresh token stored. Never consented." };
  try {
    // The real test: spend the refresh token. A revoked grant only shows up here.
    await getAccessToken(env, client);
    return { state: "ok", detail: `Refresh token still valid${email ? ` (${email})` : ""}` };
  } catch (e) {
    if (e instanceof DriveNotConnectedError) {
      return { state: "failed", detail: "Stored grant was rejected. Re-consent needed." };
    }
    return failure(e);
  }
}

function probeGa4(env: Env): Probe {
  if (!env.GA4_SA_JSON) return { state: "skipped", detail: "No service-account JSON set" };
  // Catches the classic failure: the JSON got mangled on its way into the env
  // var, so every report silently returns nothing. A live report needs a
  // property id, so that half is probed per client, not here.
  const parsed = parseServiceAccount(env.GA4_SA_JSON);
  if (!parsed) return { state: "failed", detail: "Service-account JSON does not parse" };
  return { state: "ok", detail: "Service-account JSON parses and has a key" };
}

async function probePushSubscriptions(env: Env): Promise<Probe> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { state: "skipped", detail: "VAPID keys not set" };
  }
  const client = getServiceClient(env);
  if (!client) return { state: "skipped", detail: "Supabase not configured" };
  const { count, error } = await client
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true });
  if (error) return { state: "failed", detail: error.message };
  // Zero subscriptions is not a fault, it just means nothing would be delivered.
  return {
    state: "ok",
    detail: count ? `${count} device${count === 1 ? "" : "s"} subscribed` : "No devices subscribed yet",
  };
}

// Connections with no external endpoint worth pinging, or whose vendor endpoint
// has not been verified against live. Naming the reason keeps a grey dot honest
// rather than looking like an oversight.
const NO_PROBE: Record<string, string> = {
  ghl: "Probed per client below, never agency-wide",
  "google-places": "Needs a client's place id, probed per client",
  "composio-calendar": "Composio grant state is per client and held by Composio",
  resend: "The send-only key cannot read its own status without sending",
  "app-auth": "Nothing external to call. Presence is the whole check.",
  "ghl-webhook": "Inbound only. GHL calls us, so we cannot test it from here.",
  "sheets-lead-sync":
    "Inbound only. Google's servers call us on the sheet's own timer, so presence of the secret is the whole check.",
};

// The watchdog cannot usefully probe itself in the request that it is running:
// the honest question is not "is the secret set" but "did the scheduler
// actually fire recently", which only the snapshot history can answer.
async function probeHealthCron(env: Env): Promise<Probe> {
  if (!env.HEALTH_CRON_SECRET) {
    return { state: "skipped", detail: "No secret set, so the scheduled check is off" };
  }
  const client = getServiceClient(env);
  if (!client) return { state: "skipped", detail: "Supabase not configured" };
  const { data, error } = await client
    .from("connection_health_snapshots")
    .select("checked_at")
    .order("checked_at", { ascending: false })
    .limit(1);
  if (error) return { state: "failed", detail: error.message };
  const last = (data as { checked_at: string }[] | null)?.[0]?.checked_at;
  if (!last) {
    return { state: "failed", detail: "Secret is set but the scheduler has never run" };
  }
  const ageMs = Date.now() - new Date(last).getTime();
  const mins = Math.round(ageMs / 60000);
  // The cron runs every 30 minutes. Ninety is three missed firings: late enough
  // that this is the scheduler being down rather than one slow run.
  if (ageMs > 90 * 60 * 1000) {
    return { state: "failed", detail: `Last scheduled check was ${mins} minutes ago. The scheduler looks stopped.` };
  }
  return { state: "ok", detail: `Last scheduled check ${mins} minute${mins === 1 ? "" : "s"} ago` };
}

async function agencyHealth(env: Env): Promise<ConnectionHealth[]> {
  const probes: Record<string, () => Promise<Probe>> = {
    supabase: () => probeSupabase(env),
    "meta-ads": () => probeMeta(env),
    github: () => probeGithub(env),
    "google-drive": () => probeDrive(env),
    ga4: async () => probeGa4(env),
    "web-push": () => probePushSubscriptions(env),
    "health-cron": () => probeHealthCron(env),
  };

  return Promise.all(
    CONNECTIONS.map(async (def) => {
      // Only Cloudflare-held credentials can be checked for presence here. The
      // rest are owned by their own probe or by the per-client section.
      const credentials: CredentialState[] = def.credentials
        .filter((c) => c.home === "cloudflare")
        .map((c) => ({
          name: c.name,
          present: envPresence(env, c.name),
          optional: !!c.optional,
        }));
      const missing = credentials.filter((c) => !c.present && !c.optional).map((c) => c.name);

      const probeFn = probes[def.id];
      let probe: Probe;
      if (probeFn) {
        probe = await probeFn().catch(failure);
      } else {
        probe = { state: "skipped", detail: NO_PROBE[def.id] ?? "No probe implemented yet" };
      }

      return { id: def.id, configured: missing.length === 0, missing, credentials, probe };
    }),
  );
}

async function clientHealth(env: Env): Promise<ClientConnectionHealth[]> {
  const client = getServiceClient(env);
  if (!client) return [];
  const { data, error } = await client
    .from("tenants")
    .select(
      "id, slug, name, ghl_location_id, ghl_token, meta_ad_account_id, google_place_id, ga4_property_id",
    )
    .order("name");
  if (error || !data) return [];

  type Row = {
    id: string;
    slug: string | null;
    name: string | null;
    ghl_location_id: string | null;
    ghl_token: string | null;
    meta_ad_account_id: string | null;
    google_place_id: string | null;
    ga4_property_id: string | null;
  };

  return Promise.all(
    (data as Row[]).map(async (row) => {
      const ghlSet = !isPlaceholder(row.ghl_location_id) && !isPlaceholder(row.ghl_token);
      let ghlProbe: Probe = {
        state: "skipped",
        detail: "No token or location set",
      };
      if (ghlSet) {
        try {
          // Same call the onboarding readiness check uses: cheap, read-only, and
          // it fails exactly when the token has been revoked or reissued.
          const res = await ghlFetch(
            { token: row.ghl_token as string, locationId: row.ghl_location_id as string },
            `/locations/${encodeURIComponent(row.ghl_location_id as string)}/customValues`,
          );
          ghlProbe = res.ok
            ? { state: "ok", detail: "Token accepted for this location" }
            : { state: "failed", detail: `Returned ${res.status}` };
        } catch (e) {
          ghlProbe = failure(e);
        }
      }

      return {
        tenantId: row.id,
        name: row.name || row.slug || row.id,
        slug: row.slug ?? "",
        set: {
          ghl: ghlSet,
          "meta-ads": !isPlaceholder(row.meta_ad_account_id),
          ga4: !isPlaceholder(row.ga4_property_id),
          "google-places": !isPlaceholder(row.google_place_id),
        },
        ghlProbe,
      };
    }),
  );
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const host = url.hostname;
  const environment = host === "localhost" || host === "127.0.0.1" ? "local" : "production";

  // Agency and per-client work are independent, so run them together: the page
  // waits on the slowest vendor, not on the sum of every vendor.
  const [connections, clients] = await Promise.all([agencyHealth(ctx.env), clientHealth(ctx.env)]);

  const body: HealthResponse = {
    environment,
    checkedAt: new Date().toISOString(),
    connections,
    clients,
  };

  // The scheduled caller, and only it, records this run and alerts on changes.
  // A person opening the page must NOT write a snapshot: doing so would consume
  // the comparison, so a breakage seen on screen would look like the new normal
  // to the next scheduled run, and the alert would never fire. See healthWatch.
  const scheduled = isHealthCronRequest(
    ctx.request.method,
    url.pathname,
    ctx.request.headers.get(HEALTH_CRON_HEADER),
    ctx.env.HEALTH_CRON_SECRET,
  );
  if (scheduled) {
    const watch = await recordAndAlert(ctx.env, body, crypto.randomUUID());
    return Response.json({ ...body, watch }, { headers: { "Cache-Control": "no-store" } });
  }

  // Never cached: a stale health snapshot is the exact failure this page exists
  // to prevent.
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
};
