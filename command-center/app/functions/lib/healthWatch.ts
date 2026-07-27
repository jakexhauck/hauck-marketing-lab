import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { getServiceClient } from "./supabase";
import type { Env } from "./env";
import type { HealthResponse } from "../../src/lib/connectionHealth";
import {
  snapshotFrom,
  diffSnapshots,
  type HealthSnapshotRow,
} from "../../src/lib/healthSnapshots";
import { buildHealthAlert } from "../../src/lib/healthAlert";

// The unattended half of the control room: store this run, compare it with the
// last one, and tell someone only about what changed.
//
// Runs ONLY for the scheduled caller, never when a person opens the page. That
// is not an optimisation, it is correctness: recording a snapshot consumes the
// comparison. If opening the page wrote a snapshot, then opening it just after
// something broke would record the breakage as the new normal, and the cron
// half an hour later would see no change and say nothing. The one time you most
// want the alert is the one time you would not get it.
//
// Every failure in here is swallowed and logged. A watchdog that can take down
// the page it watches is worse than no watchdog, and this whole path is a side
// effect of a request whose actual job is to return a health snapshot.

/** Snapshots older than this are pruned on each run. */
const RETAIN_DAYS = 7;

/** Notifications reach admin devices only: a client must never see this. */
const ADMIN_PARTICIPANT = "admin";

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface StoredRow {
  connection_id: string;
  label: string;
  state: HealthSnapshotRow["state"];
  detail: string;
}

/**
 * Read back the most recent stored run, whole.
 *
 * Two queries rather than one: find the newest run_id, then take that run's
 * rows. Taking "the newest N rows" instead would silently mix two runs together
 * the moment the registry grows.
 */
async function previousSnapshot(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
): Promise<HealthSnapshotRow[]> {
  const { data: latest } = await client
    .from("connection_health_snapshots")
    .select("run_id")
    .order("checked_at", { ascending: false })
    .limit(1);
  const runId = (latest as { run_id: string }[] | null)?.[0]?.run_id;
  if (!runId) return [];

  const { data } = await client
    .from("connection_health_snapshots")
    .select("connection_id, label, state, detail")
    .eq("run_id", runId);

  return ((data as StoredRow[] | null) ?? []).map((r) => ({
    connectionId: r.connection_id,
    label: r.label,
    state: r.state,
    detail: r.detail,
  }));
}

/** Send one notification to every admin device. Best effort, dead ones pruned. */
async function alertAdmins(
  env: Env,
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  alert: { title: string; body: string; url: string },
): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;

  // participant_kind is the only honest "this device belongs to us" signal:
  // push_subscriptions is otherwise keyed by tenant, and a client's phone must
  // never be told that the agency's Meta token expired.
  const { data } = await client
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("participant_kind", ADMIN_PARTICIPANT);

  const rows = (data as SubRow[] | null) ?? [];
  if (rows.length === 0) return 0;

  const payloadData = JSON.stringify(alert);
  const vapid = {
    subject: "mailto:jake@hauckmarketing.com",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  let sent = 0;
  await Promise.all(
    rows.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        const payload = await buildPushPayload(
          { data: payloadData, options: { ttl: 3600 } },
          subscription,
          vapid,
        );
        const res = await fetch(row.endpoint, payload);
        // 404 / 410 mean the subscription is dead. Prune it so we stop trying.
        if (res.status === 404 || res.status === 410) {
          await client.from("push_subscriptions").delete().eq("id", row.id);
        } else if (res.ok) {
          sent += 1;
        }
      } catch (err) {
        console.error("[healthWatch] push failed for", row.id, err);
      }
    }),
  );
  return sent;
}

export interface WatchResult {
  recorded: number;
  broke: string[];
  recovered: string[];
  notified: number;
}

/**
 * Record this run and alert on anything that just broke.
 *
 * Only `broke` sends a notification. Recoveries are stored and returned, but
 * good news at 3am is still a phone lighting up at 3am.
 */
export async function recordAndAlert(
  env: Env,
  response: HealthResponse,
  runId: string,
): Promise<WatchResult> {
  const empty: WatchResult = { recorded: 0, broke: [], recovered: [], notified: 0 };
  const client = getServiceClient(env);
  if (!client) return empty;

  const current = snapshotFrom(response);

  try {
    const previous = await previousSnapshot(client);
    const { broke, recovered } = diffSnapshots(previous, current);

    const { error } = await client.from("connection_health_snapshots").insert(
      current.map((row) => ({
        run_id: runId,
        checked_at: response.checkedAt,
        connection_id: row.connectionId,
        label: row.label,
        state: row.state,
        detail: row.detail.slice(0, 500),
      })),
    );
    if (error) {
      // Nothing was stored, so the next run compares against the same previous
      // snapshot and will report the same flip. Losing a write delays the
      // alert; it does not lose it.
      console.error("[healthWatch] snapshot insert failed:", error.message);
      return empty;
    }

    let notified = 0;
    const alert = buildHealthAlert(broke);
    if (alert) notified = await alertAdmins(env, client, alert);

    // Pruning last, and never allowed to affect the result: a failed cleanup is
    // a housekeeping problem, not a monitoring one.
    const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await client
      .from("connection_health_snapshots")
      .delete()
      .lt("checked_at", cutoff)
      .then(undefined, (e: unknown) => console.error("[healthWatch] prune failed", e));

    return {
      recorded: current.length,
      broke: broke.map((r) => r.connectionId),
      recovered: recovered.map((r) => r.connectionId),
      notified,
    };
  } catch (err) {
    console.error("[healthWatch] failed", err);
    return empty;
  }
}
