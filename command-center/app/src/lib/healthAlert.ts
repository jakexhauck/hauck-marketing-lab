// What the 3am notification actually says.
//
// A monitoring alert has about one line to justify waking someone. Spent on a
// key name it is useless: "META_SYSTEM_USER_TOKEN failed" needs a lookup before
// you can decide whether to care. Spent on the consequence it is a decision:
// "Paid Ads goes dark" tells you at a glance whether this is a morning problem
// or a right-now problem.
//
// So every alert is built from the registry's own surface list, through the
// same consequenceOf() the control room already shows on screen. The alert and
// the page therefore cannot disagree about what a connection costs.

import { CONNECTIONS } from "./connectionRegistry";
import { consequenceOf } from "./settingsActions";
import type { HealthSnapshotRow } from "./healthSnapshots";

export interface HealthAlert {
  title: string;
  body: string;
  url: string;
}

/** Notification bodies get truncated by the OS. Say less, on purpose. */
const MAX_BODY = 160;

/**
 * The registry id behind a snapshot row.
 *
 * Per-client rows are `client:<slug>:<id>`, and the id is the LAST segment so a
 * slug that happens to contain a colon cannot shift which connection the alert
 * claims broke.
 */
export function baseConnectionId(connectionId: string): string {
  if (!connectionId.startsWith("client:")) return connectionId;
  const parts = connectionId.split(":");
  return parts[parts.length - 1];
}

/** The consequence line for a row, or its probe detail if we cannot place it. */
function why(row: HealthSnapshotRow): string {
  const def = CONNECTIONS.find((d) => d.id === baseConnectionId(row.connectionId));
  // A row whose connection has since been renamed or removed still has to say
  // something true, and the probe's own message is the honest fallback.
  return def ? consequenceOf(def) : row.detail;
}

/**
 * One notification for everything that just broke, or null when nothing did.
 *
 * Several breaks are deliberately collapsed into one buzz: an environment that
 * loses its secrets breaks every connection at once, and a dozen separate
 * notifications about one event say less than a single one that counts them.
 */
export function buildHealthAlert(broke: HealthSnapshotRow[]): HealthAlert | null {
  if (broke.length === 0) return null;

  const url = "/admin/settings";

  if (broke.length === 1) {
    const row = broke[0];
    return { title: `${row.label} stopped working`, body: why(row), url };
  }

  const title = `${broke.length} connections stopped working`;
  const labels = broke.map((r) => r.label);
  let body = labels.join(", ");
  if (body.length > MAX_BODY) {
    // Name as many as fit, then count the rest. A truncated list that ends
    // mid-word reads like a bug; "and 4 more" reads like a summary.
    const kept: string[] = [];
    for (const label of labels) {
      const tail = ` and ${labels.length - kept.length - 1} more`;
      if ([...kept, label].join(", ").length + tail.length > MAX_BODY) break;
      kept.push(label);
    }
    body = `${kept.join(", ")} and ${labels.length - kept.length} more`;
  }
  return { title, body, url };
}
