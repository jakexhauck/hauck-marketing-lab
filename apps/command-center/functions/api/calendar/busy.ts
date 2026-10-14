import type { Env, ApiData } from "../../lib/env";
import { getBusy, getConnection, composioUserId } from "../../lib/googleCalendar";

// Hours the client's own Google Calendar reports as taken, so the Jobs
// calendar can grey them out. Availability only: no titles, no attendees, no
// detail of any kind is requested or returned.

// IANA zone names only: letters, digits, +, -, _ and / (e.g. America/Detroit,
// Etc/GMT+5). Anything else is rejected rather than forwarded upstream.
const ZONE_RE = /^[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)*$/;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!start || !end) {
    return Response.json({ error: "start and end are required" }, { status: 400 });
  }

  // The viewer's own zone, sent by the browser. TENANT_TIMEZONE exists in Env
  // but is unused and unset, and the calendar renders in the viewer's local
  // time, so the browser is both the accurate and the cheap source. Getting
  // this wrong lands every busy block hours off.
  const tzParam = url.searchParams.get("tz") ?? "";
  const timezone = ZONE_RE.test(tzParam) ? tzParam : "UTC";

  const userId = composioUserId(ctx.data.tenant);
  const conn = await getConnection(ctx.env, userId);
  if (!conn.connected) {
    // Not an error. Most clients will not have linked anything, and the
    // calendar must render exactly as it did before this feature existed.
    return Response.json({ connected: false, busy: [] });
  }

  const busy = await getBusy(ctx.env, userId, { timeMin: start, timeMax: end, timezone });
  return Response.json(
    { connected: true, busy },
    {
      // Short private cache: busy time is not urgent, and Composio's managed
      // auth shares a rate-limit quota across all of its customers, so this
      // shields the quota from a client flipping between calendar views.
      headers: { "Cache-Control": "private, max-age=60" },
    },
  );
};
