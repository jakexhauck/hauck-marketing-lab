// The alarm clock for the Command Center's connection health check.
//
// Cloudflare Pages has no cron trigger, so this Worker exists purely to wake up
// on a schedule and knock on the app's door. It is intentionally the dumbest
// component in the estate: one GET, one header, one log line. Everything that
// decides what "broken" means, what changed since last time, and who gets told
// lives in the app, where it is unit tested.
//
// Keeping it dumb is also what keeps it safe. It holds one secret, that secret
// buys exactly one read-only snapshot, and there is nothing else here to steal.

export interface Env {
  /** The health endpoint to call. Set in wrangler.toml [vars]. */
  HEALTH_URL: string;
  /**
   * Shared with the app's own environment. Must match EXACTLY on both sides or
   * every run comes back 401 and the checks stop without anybody noticing,
   * which is why the app reports its own last-run age as a connection.
   */
  HEALTH_CRON_SECRET?: string;
}

// The probe fans out to every vendor, so it is slower than a normal request.
// Well under the Worker's own limit, but bounded so a hung vendor cannot pin
// this run open until the platform kills it.
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

async function runCheck(env: Env): Promise<string> {
  if (!env.HEALTH_CRON_SECRET) {
    // Loud rather than silent: an unset secret means the watchdog is off, and a
    // watchdog that is off while looking installed is worse than none.
    return "HEALTH_CRON_SECRET is not set on this Worker. Nothing was checked.";
  }

  const res = await fetch(env.HEALTH_URL, {
    method: "GET",
    headers: { "x-health-cron": env.HEALTH_CRON_SECRET },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (res.status === 401) {
    return "401 from the health endpoint. The secret here does not match the app's.";
  }
  if (!res.ok) {
    return `Health endpoint returned ${res.status}.`;
  }

  // The app returns its own summary of what it did with the run. Logging it
  // means `wrangler tail` answers "did the alert actually fire" directly.
  const body = (await res.json()) as {
    watch?: { recorded: number; broke: string[]; recovered: string[]; notified: number };
  };
  const w = body.watch;
  if (!w) return "Checked, but the app recorded nothing. Is the secret gate passing?";
  return [
    `checked ${w.recorded} connections`,
    `broke: ${w.broke.length ? w.broke.join(", ") : "none"}`,
    `recovered: ${w.recovered.length ? w.recovered.join(", ") : "none"}`,
    `notified ${w.notified} device${w.notified === 1 ? "" : "s"}`,
  ].join(" | ");
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCheck(env)
        .then((line) => console.log("[health-cron]", line))
        // A thrown error here would just retry on the next tick anyway. Log it
        // so `wrangler tail` shows a reason rather than a silent gap.
        .catch((err) => console.error("[health-cron] failed:", err)),
    );
  },

  // Manual trigger, so the very first run does not mean waiting up to half an
  // hour to find out whether any of this works. Same code path as the cron.
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/run") {
      return new Response("hauck-health-cron. POST /run to fire a check now.", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("POST /run", { status: 405 });
    }
    // Authenticated with the same secret it would send onward, so this manual
    // door is no weaker than the scheduled one.
    if (!secretMatches(request.headers.get("x-health-cron"), env.HEALTH_CRON_SECRET)) {
      return new Response("unauthorized", { status: 401 });
    }
    const line = await runCheck(env);
    console.log("[health-cron] manual:", line);
    return new Response(line, { status: 200 });
  },
};
