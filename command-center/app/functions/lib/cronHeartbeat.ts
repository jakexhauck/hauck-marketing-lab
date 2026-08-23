import type { SupabaseClient } from "@supabase/supabase-js";

// Freshness receipts for the scheduled jobs (0120).
//
// Each cron-called sync handler bumps its row after success; the health probe
// judges freshness from last_ok_at. Staleness thresholds live here next to the
// job names so the schedule and its alarm can never drift apart silently.

export type CronJob = "ads-sync" | "calendar-sync" | "cold-call-sync" | "morning-briefing";

// How stale a job may run before the probe calls it stopped. Generous on
// purpose: one slow run or one missed firing is noise, three in a row is the
// scheduler being down. ads runs daily (26h = one missed night), calendar
// every 15 min (45m), dialer every minute (10m, it feeds live dialing).
export const CRON_MAX_AGE_MINUTES: Record<CronJob, number> = {
  "ads-sync": 26 * 60,
  "calendar-sync": 45,
  "cold-call-sync": 10,
  "morning-briefing": 26 * 60,
};

/** Upsert the heartbeat after a successful run. Best-effort by contract. */
export async function bumpCronHeartbeat(
  client: SupabaseClient,
  job: CronJob,
  detail?: string,
): Promise<void> {
  try {
    const { error } = await client
      .from("cron_heartbeats")
      .upsert(
        { job, last_ok_at: new Date().toISOString(), detail: detail ?? null },
        { onConflict: "job" },
      );
    if (error) console.warn(`[cronHeartbeat] ${job} bump refused:`, error.message);
  } catch (err) {
    console.warn(`[cronHeartbeat] ${job} bump threw`, err);
  }
}

export interface HeartbeatRow {
  job: string;
  last_ok_at: string | null;
}

/** Age of a heartbeat in whole minutes, or null when the job has never run. */
export function heartbeatAgeMinutes(
  lastOkAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!lastOkAt) return null;
  const t = new Date(lastOkAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 60000));
}

// The shape mirrors the health probe's Probe union without importing it: this
// module stays dependency-free so any surface can reuse it.
export interface HeartbeatStatus {
  state: "ok" | "failed" | "skipped";
  detail: string;
}

/** Judge one heartbeat against its freshness budget. Pure; unit-tested. */
export function judgeHeartbeat(
  job: CronJob,
  row: HeartbeatRow | null | undefined,
  nowMs: number = Date.now(),
): HeartbeatStatus {
  const budget = CRON_MAX_AGE_MINUTES[job];
  const age = heartbeatAgeMinutes(row?.last_ok_at, nowMs);
  if (age === null) {
    return {
      state: "failed",
      detail: "The scheduled job has never recorded a successful run",
    };
  }
  if (age > budget) {
    return {
      state: "failed",
      detail: `Last successful run ${age} minutes ago. The scheduled worker looks stopped.`,
    };
  }
  return { state: "ok", detail: `Last successful run ${age} minutes ago` };
}
