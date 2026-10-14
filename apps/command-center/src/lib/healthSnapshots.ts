// Turning a health snapshot into news.
//
// The control room answers "what is broken right now". The scheduled check asks
// a harder question: "what is broken NOW that was not broken half an hour ago".
// Those are different, and conflating them is how a monitoring system becomes
// something everyone mutes.
//
// So: a snapshot is a flat list of comparable rows, and only a FLIP between two
// snapshots is worth telling anyone about. Two rules follow from that, and both
// are load-bearing:
//
//   - A row the previous snapshot never saw is never an alert. Otherwise the
//     first ever run pages about the entire estate at once, and every newly
//     registered connection pages at whatever hour it was deployed.
//   - "unverified" is an unknown, not a fault. Alerting on it would mean
//     alerting on our own missing probe rather than on anything being wrong.

import { CONNECTIONS } from "./connectionRegistry";
import {
  deriveState,
  stateReason,
  type ConnState,
  type HealthResponse,
} from "./connectionHealth";

export interface HealthSnapshotRow {
  /**
   * Stable across runs. Agency rows use the registry id; per-client rows are
   * namespaced `client:<slug>:<connectionId>` so one client's dead token is its
   * own flip rather than something that hides behind, or drags down, the rest.
   */
  connectionId: string;
  /** What a human calls it. The alert reads this, never the id. */
  label: string;
  state: ConnState;
  detail: string;
}

export interface SnapshotDiff {
  /** Rows that were fine and are now not. The only thing worth a push. */
  broke: HealthSnapshotRow[];
  /** Rows that were not fine and now are. Good news, but it can wait. */
  recovered: HealthSnapshotRow[];
}

/**
 * Does this state mean someone has to do something?
 *
 * `unverified` deliberately counts as fine: we could not test it, which is not
 * evidence that it is broken. `unconfigured` counts as NOT fine, because a
 * credential going missing is exactly how the login outage happened.
 */
function isBad(state: ConnState): boolean {
  return state === "down" || state === "unconfigured";
}

/** Flatten a health response into rows that two runs can be compared on. */
export function snapshotFrom(response: HealthResponse): HealthSnapshotRow[] {
  const labelById = new Map(CONNECTIONS.map((d) => [d.id, d.label]));
  const rows: HealthSnapshotRow[] = [];

  for (const health of response.connections) {
    rows.push({
      connectionId: health.id,
      label: labelById.get(health.id) ?? health.id,
      state: deriveState(health),
      detail: stateReason(health),
    });
  }

  for (const client of response.clients) {
    for (const [id, isSet] of Object.entries(client.set)) {
      // A credential the client never had is not a fault and must never become
      // an alert: a client with no ad account simply is not running ads.
      if (!isSet) continue;
      // GHL is the only per-client credential with a live probe. The others are
      // ids rather than secrets, so "set" is all we can honestly say, and an
      // unverified row never alerts either way.
      const state: ConnState =
        id === "ghl"
          ? client.ghlProbe.state === "ok"
            ? "live"
            : client.ghlProbe.state === "failed"
              ? "down"
              : "unverified"
          : "unverified";
      rows.push({
        connectionId: `client:${client.slug || client.tenantId}:${id}`,
        label: `${client.name}: ${labelById.get(id) ?? id}`,
        state,
        detail: id === "ghl" ? client.ghlProbe.detail : "Set, no probe for this one",
      });
    }
  }

  return rows;
}

/**
 * What changed between two snapshots.
 *
 * `previous` is the last stored run and `current` is the one just taken. Rows
 * are matched on connectionId; anything present in only one of them is skipped,
 * since neither a first sighting nor a retirement is a failure.
 */
export function diffSnapshots(
  previous: HealthSnapshotRow[],
  current: HealthSnapshotRow[],
): SnapshotDiff {
  const before = new Map(previous.map((r) => [r.connectionId, r]));
  const broke: HealthSnapshotRow[] = [];
  const recovered: HealthSnapshotRow[] = [];

  for (const row of current) {
    const was = before.get(row.connectionId);
    if (!was) continue;
    const wasBad = isBad(was.state);
    const isNowBad = isBad(row.state);
    if (!wasBad && isNowBad) broke.push(row);
    else if (wasBad && !isNowBad) recovered.push(row);
  }

  return { broke, recovered };
}
