// The alarm clock for the client's Google Calendar, pushed into GoHighLevel.
//
// Cloudflare Pages has no cron trigger, so this Worker exists purely to wake up
// and knock on the app's door. Sibling of workers/ads-cron and
// workers/health-cron and deliberately the same shape: one request, one header,
// one log line. Every decision about which clients to sync, which calendar to
// block and how to take a block back out lives in the app, where it is tested.
//
// Why it matters that this runs: a client links their Google Calendar on the
// connect screen and is told their real commitments will not be offered to
// customers. Until something calls the sync, that promise is only half kept:
// the app's own Jobs view greys the hours out, but the calendar a customer
// books into knows nothing about them. The failure is silent on both sides
// until somebody arrives to an empty driveway.

export interface Env {
  /** The sync endpoint to call. Set in wrangler.toml [vars]. */
  SYNC_URL: string;
  /**
   * Shared with the app's own environment. Must match EXACTLY on both sides or
   * every run comes back 401 and blocked slots silently stop updating.
   *
   * Its own value, never shared with the ads or health cron secrets: this one
   * triggers writes into a client's live booking calendar.
   */
  CALENDAR_CRON_SECRET?: string;
}

// The sync walks every client and talks to both Google and GoHighLevel per
// client. Bounded so one hung upstream cannot pin the run open until the
// platform kills it, and comfortably inside the fifteen minutes before the next
// tick.
const TIMEOUT_MS = 120_000;

/** Constant time in the equal-length case, so the manual door leaks no prefix. */
function secretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!expected || !presented || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

interface SyncResult {
  tenantId?: string;
  status?: string;
  created?: number;
  updated?: number;
  removed?: number;
  detail?: string;
}

interface SyncBody {
  ran?: number;
  created?: number;
  updated?: number;
  removed?: number;
  results?: SyncResult[];
}

async function runSync(env: Env): Promise<string> {
  if (!env.CALENDAR_CRON_SECRET) {
    // Loud rather than silent: an unset secret means a client's busy time never
    // reaches the calendar their customers book into, and every screen involved
    // looks perfectly healthy while that is true.
    return "CALENDAR_CRON_SECRET is not set on this Worker. Nothing was synced.";
  }

  const res = await fetch(env.SYNC_URL, {
    method: "POST",
    headers: { "x-calendar-cron": env.CALENDAR_CRON_SECRET },
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
  // "not_connected" is the normal state for most clients: they have not linked
  // a calendar, or their CRM is not wired yet. It is counted, never listed, so
  // the log stays a health signal rather than a roll call.
  const failed = results.filter((r) => r.status === "error");
  const idle = results.filter((r) => r.status === "not_connected");

  return [
    `${body.created ?? 0} blocked, ${body.updated ?? 0} moved, ${body.removed ?? 0} freed` +
      ` across ${results.length - idle.length} linked of ${results.length} clients`,
    `failed: ${failed.length ? failed.map((r) => `${r.tenantId}: ${r.detail}`).join("; ") : "none"}`,
  ].join(" | ");
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runSync(env)
        .then((line) => console.log("[calendar-cron]", line))
        // A thrown error here would just retry on the next tick anyway. Log it
        // so `wrangler tail` shows a reason rather than a silent gap.
        .catch((err) => console.error("[calendar-cron] failed:", err)),
    );
  },

  // Manual trigger, so the first run does not mean waiting a quarter of an hour
  // to find out whether any of this works. Same code path as the cron.
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/run") {
      return new Response("hauck-calendar-cron. POST /run to fire a sync now.", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("POST /run", { status: 405 });
    }
    // Authenticated with the same secret it would send onward, so this manual
    // door is no weaker than the scheduled one.
    if (!secretMatches(request.headers.get("x-calendar-cron"), env.CALENDAR_CRON_SECRET)) {
      return new Response("unauthorized", { status: 401 });
    }
    const line = await runSync(env);
    console.log("[calendar-cron] manual:", line);
    return new Response(line, { status: 200 });
  },
};
