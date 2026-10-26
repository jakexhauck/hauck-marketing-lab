import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { HEALTH_CRON_HEADER, isHealthCronRequest } from "../../../lib/healthCron";
import { recordAndAlert } from "../../../lib/healthWatch";
import { agencyHealth, clientHealth } from "../../../lib/connectionsHealth";
import type { HealthResponse } from "../../../../src/lib/connectionHealth";
import { checkRunnerOffline } from "../../../lib/telegramManager";

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
//
// The probes themselves live in lib/connectionsHealth.ts.

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
    // The agent runner's heartbeat rides the same schedule: gone quiet over
    // ten minutes is a Telegram alert to Jake, once per incident. Its own
    // failure must not cost the health run its answer.
    const db = getServiceClient(ctx.env);
    if (db) {
      await checkRunnerOffline(ctx.env, db).catch((err) =>
        console.error("[telegram] runner alert failed:", (err as Error).message),
      );
    }
    return Response.json({ ...body, watch }, { headers: { "Cache-Control": "no-store" } });
  }

  // Never cached: a stale health snapshot is the exact failure this page exists
  // to prevent.
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
};
