// The alarm clock for GoHighLevel's power dialer.
//
// Cloudflare Pages has no cron trigger, so this Worker exists purely to wake up
// and knock on the app's door. Sibling of workers/ads-cron, workers/health-cron
// and workers/calendar-cron and deliberately the same shape: one request, one
// header, one log line. Every decision about which calls are new, which prospect
// they belong to and who made them lives in the app, where it is tested.
//
// Why it matters that this runs: until it existed, a call was recorded by the
// browser poll on an open calling page, so the record depended on somebody
// having a tab in front. On 2026-08-19 that assumption broke in the ordinary
// way. The caller was dialing in GoHighLevel, the Command Center tab sat behind
// it, Chrome throttled its timers, and three real calls went unrecorded for
// eight minutes. Every call before the gap had landed within seventeen seconds.
// Nothing was broken and nobody was looking, which is the worst combination for
// a table the tracker, the funnel and the script numbers all read from.

export interface Env {
  /** The sync endpoint to call. Set in wrangler.toml [vars]. */
  SYNC_URL: string;
  /**
   * Shared with the app's own environment. Must match EXACTLY on both sides or
   * every run comes back 401 and calls silently stop being recorded.
   *
   * Its own value, never shared with the ads, health or calendar cron secrets.
   */
  COLD_CALL_CRON_SECRET?: string;
}

// One GoHighLevel search plus at most six conversation reads. Bounded well
// inside the minute before the next tick, so a hung upstream cannot leave two
// runs overlapping.
const TIMEOUT_MS = 45_000;

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
  configured?: boolean;
  created?: number;
  stamped?: number;
  caller?: string | null;
}

async function runSync(env: Env): Promise<string> {
  if (!env.COLD_CALL_CRON_SECRET) {
    // Loud rather than silent: an unset secret means calls stop being recorded
    // while every screen involved looks perfectly healthy, which is precisely
    // the failure mode this Worker was built to remove.
    return "COLD_CALL_CRON_SECRET is not set on this Worker. Nothing was synced.";
  }

  const res = await fetch(env.SYNC_URL, {
    method: "POST",
    headers: { "x-cold-call-cron": env.COLD_CALL_CRON_SECRET },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (res.status === 401) {
    return "401 from the sync endpoint. The secret here does not match the app's.";
  }
  if (!res.ok) {
    return `Sync endpoint returned ${res.status}.`;
  }

  const body = (await res.json()) as SyncBody;
  if (body.configured === false) {
    return "the agency GoHighLevel account is not connected. Nothing was synced.";
  }
  if (body.caller === null) {
    return "no caller to attribute to yet. Nothing was synced.";
  }

  // The quiet answer is 0 recorded, and it is the usual one: a minute in which
  // the dialer placed nothing new, or placed calls a caller's own open page had
  // already recorded seconds earlier. Logged anyway, because a run of zeros
  // during a shift is the signal worth seeing.
  return `${body.created ?? 0} recorded, ${body.stamped ?? 0} stamped`;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runSync(env)
        .then((line) => console.log("[dialer-cron]", line))
        // A thrown error here would just retry on the next tick anyway. Log it
        // so `wrangler tail` shows a reason rather than a silent gap.
        .catch((err) => console.error("[dialer-cron] failed:", err)),
    );
  },

  // Manual trigger, so the first run does not mean waiting for the top of the
  // minute to find out whether any of this works. Same code path as the cron.
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/run") {
      return new Response("hauck-dialer-cron. POST /run to fire a sync now.", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("POST /run", { status: 405 });
    }
    // Authenticated with the same secret it would send onward, so this manual
    // door is no weaker than the scheduled one.
    if (!secretMatches(request.headers.get("x-cold-call-cron"), env.COLD_CALL_CRON_SECRET)) {
      return new Response("unauthorized", { status: 401 });
    }
    const line = await runSync(env);
    console.log("[dialer-cron] manual:", line);
    return new Response(line, { status: 200 });
  },
};
