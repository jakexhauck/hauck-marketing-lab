import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { syncAgencyMeetings } from "../../lib/salesCallSync";
import { DEFAULT_WINDOW_MINUTES } from "../../../lib/powerDialer";
import {
  readWindowRows,
  resolveCronCaller,
  runPowerDialerSync,
} from "../../../lib/powerDialerSync";
import { bumpCronHeartbeat } from "../../../lib/cronHeartbeat";
import { logErrorBestEffort } from "../../../lib/errorLog";

// POST /api/admin/cold-call/sync  (cron gated in _middleware.ts, no session)
//
// Record the calls GoHighLevel's power dialer has placed, without anybody being
// there.
//
// Until this existed the recording was a side effect of the /live poll, so it
// only ran while a calling page was open and awake in a browser. That is not a
// property anybody chose; it is what happens when the page that displays a thing
// is also the thing that writes it. On 2026-08-19 a tab sat behind GoHighLevel
// for eight minutes, Chrome throttled its timers, and three calls went
// unrecorded until one late poll swept them up. The dial table feeds the
// tracker, the funnel and the script variation numbers, so "was a tab in front"
// is not an acceptable input to any of them.
//
// Now it is a cron. Every minute, no browser, no laptop, no tab. The browser
// poll still syncs too, because a caller watching the card should not wait up to
// a minute for it to move, and the two cannot collide: one call is one row, held
// by the unique index on call_message_id (0113).
//
// Deliberately NOT what this does: judge anything. Every row it writes is
// `pending`, which counts as a call made and nothing else. What the call became
// is a human judgement and stays one.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({ configured: false, created: 0, stamped: 0 });
  }

  // The same twenty minutes the browser poll reads. A minute would be enough for
  // the steady case and useless for the one that matters: a deploy, a platform
  // hiccup or a GoHighLevel outage puts a gap in the schedule, and the next run
  // has to be able to reach back over it.
  const since = Date.now() - DEFAULT_WINDOW_MINUTES * 60_000;

  // Every fifth minute this run reads the calendar instead of the dialer.
  //
  // Meetings are booked in GoHighLevel since 2026-10-01, and the tracker counts
  // them off the Cold Call calendar by the day the row first appears
  // (lib/coldCallMeetings.ts), so the calendar has to be read without anybody
  // opening a page. INSTEAD of the dialer sync, not as well: the two together
  // can pass the 50 subrequest cap, and a dialer run skipped is caught by the
  // next one (it reaches back twenty minutes).
  //
  // A narrow window, two hours back to sixty days ahead: a new booking is a
  // meeting in the future, and reading the whole 180 days every five minutes
  // would be one update per meeting for no new information.
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

  const callerId = await resolveCronCaller(client);
  if (!callerId) {
    // caller_id is NOT NULL (0052) and there is nobody to attribute to, which on
    // this account means no cold call has ever been recorded. Nothing to do, and
    // nothing wrong: the first press by a real caller makes every run after this
    // one work.
    return Response.json({ configured: true, created: 0, stamped: 0, caller: null });
  }

  const { dials, leads } = await readWindowRows(client, since);
  const counts = await runPowerDialerSync(ctx.env, client, { dials, leads, since, callerId });

  // Receipt for the watchdog. The dialer feeds live calling, so a stopped
  // worker must be loud within minutes, not days: the health probe fails this
  // heartbeat after ten quiet ones.
  await bumpCronHeartbeat(client, "cold-call-sync", `${counts.created ?? 0} dials recorded`);

  return Response.json({ configured: true, ...counts, caller: callerId });
};
