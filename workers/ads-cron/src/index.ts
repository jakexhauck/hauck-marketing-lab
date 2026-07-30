// The alarm clock for the Command Center's Meta spend snapshot.
//
// Cloudflare Pages has no cron trigger, so this Worker exists purely to wake up
// once a night and knock on the app's door. Sibling of workers/health-cron and
// deliberately the same shape: one request, one header, one log line. Every
// decision about which clients to sync, how far back, and what to do with a
// broken ad account lives in the app, where it is tested.
//
// Why it matters that this runs: the client Paid Ads Dashboard divides by ad
// spend for ROAS, cost per lead and cost per booking. A stale snapshot does not
// blank those figures out, it makes them quietly wrong, which is the worst way
// for a client-facing number to fail.

export interface Env {
  /** The sync endpoint to call. Set in wrangler.toml [vars]. */
  SYNC_URL: string;
  /**
   * Shared with the app's own environment. Must match EXACTLY on both sides or
   * every run comes back 401 and spend silently stops updating.
   *
   * NOT the same value as the health cron's secret: that one buys a read, this
   * one triggers a write.
   */
  ADS_CRON_SECRET?: string;
}

// The sync walks every client and calls Meta once per account. Slower than a
// normal request, but bounded so one hung ad account cannot pin the run open
// until the platform kills it.
const TIMEOUT_MS = 60_000;

/** Constant time in the equal-length case, so the manual door leaks no prefix. */
function secretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!expected || !presented || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

interface SyncBody {
  days?: number;
  rows?: number;
  results?: { name?: string; rows?: number; skipped?: string; error?: string }[];
}

async function runSync(env: Env): Promise<string> {
  if (!env.ADS_CRON_SECRET) {
    // Loud rather than silent: an unset secret means spend never refreshes, and
    // a dashboard quietly dividing by last week's number looks perfectly fine.
    return "ADS_CRON_SECRET is not set on this Worker. Nothing was synced.";
  }

  const res = await fetch(env.SYNC_URL, {
    method: "POST",
    headers: { "x-ads-cron": env.ADS_CRON_SECRET },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (res.status === 401) {
    return "401 from the sync endpoint. The secret here does not match the app's.";
  }
  if (!res.ok) {
    return `Sync endpoint returned ${res.status}.`;
  }

  const body = (await res.json()) as SyncBody;
  const results = body.results ?? [];
  const failed = results.filter((r) => r.error);
  const skipped = results.filter((r) => r.skipped);

  return [
    `${body.rows ?? 0} rows across ${results.length} clients (${body.days ?? "?"}d)`,
    `skipped: ${skipped.length ? skipped.map((r) => r.name).join(", ") : "none"}`,
    `failed: ${failed.length ? failed.map((r) => `${r.name}: ${r.error}`).join("; ") : "none"}`,
  ].join(" | ");
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runSync(env)
        .then((line) => console.log("[ads-cron]", line))
        // A thrown error here would just retry on the next tick anyway. Log it
        // so `wrangler tail` shows a reason rather than a silent gap.
        .catch((err) => console.error("[ads-cron] failed:", err)),
    );
  },

  // Manual trigger, so the very first run does not mean waiting until tomorrow
  // morning to find out whether any of this works. Same code path as the cron.
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/run") {
      return new Response("hauck-ads-cron. POST /run to fire a sync now.", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("POST /run", { status: 405 });
    }
    // Authenticated with the same secret it would send onward, so this manual
    // door is no weaker than the scheduled one.
    if (!secretMatches(request.headers.get("x-ads-cron"), env.ADS_CRON_SECRET)) {
      return new Response("unauthorized", { status: 401 });
    }
    const line = await runSync(env);
    console.log("[ads-cron] manual:", line);
    return new Response(line, { status: 200 });
  },
};
