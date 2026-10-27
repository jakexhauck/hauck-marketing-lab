import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { syncAgencyMeetings } from "../../lib/salesCallSync";
import { bumpCronHeartbeat } from "../../../lib/cronHeartbeat";
import { logErrorBestEffort } from "../../../lib/errorLog";

// POST /api/admin/cold-call/sync  (cron gated in _middleware.ts, no session)
//
// The dialer worker's call, every minute. It used to record the calls
// GoHighLevel's power dialer placed; Jake turned that off on 2026-10-27 ("get
// rid of it recording cold calls"). Dials are still recorded while someone has
// the calling page open (cold-call/live.ts) and when a call outcome arrives
// (crm/call-disposition.ts), never by the cron.
//
// What it still does, every fifth minute: read the sales calendar. Meetings are
// booked in GoHighLevel since 2026-10-01, and the tracker counts them off the
// Cold Call calendar by the day the row first appears (lib/coldCallMeetings.ts),
// so the calendar has to be read without anybody opening a page. The other four
// minutes do nothing.
//
// A narrow window, two hours back to sixty days ahead: a new booking is a
// meeting in the future, and reading the whole 180 days every five minutes
// would be one update per meeting for no new information.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({ configured: false });
  }

  if (new Date().getUTCMinutes() % 5 === 0) {
    const now = Date.now();
    try {
      const meetings = await syncAgencyMeetings(getAgencyGhlContext(ctx.env), client, {
        calendarIds: ctx.env.AGENCY_SALES_CALENDAR_IDS ?? null,
        fromMs: now - 2 * 60 * 60_000,
        toMs: now + 60 * 86_400_000,
      });
      await bumpCronHeartbeat(client, "cold-call-sync", `${meetings.added} meetings added`);
      return Response.json({ configured: true, meetings });
    } catch (err) {
      // Not a stopped worker, so no heartbeat is withheld for it; the next fifth
      // minute tries again and the error is on the record.
      const message = err instanceof Error ? err.message : String(err);
      logErrorBestEffort(ctx.env, "cold-call-sync", `meetings sync failed: ${message}`);
      await bumpCronHeartbeat(client, "cold-call-sync", "meetings sync failed");
      return Response.json({ configured: true, meetings: null, error: message.slice(0, 200) });
    }
  }

  return Response.json({ configured: true, skipped: true });
};
