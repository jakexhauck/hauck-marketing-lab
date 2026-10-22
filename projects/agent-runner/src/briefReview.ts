// The Manager's weekly brief review (Jake, 2026-10-22;
// docs/build-plans/mission-control-brief.md). Once a week the runner that
// answers the Manager opens an Auto chat for it; the Manager reads each active
// client's brief with its client_brief tool and brings Jake one short list,
// suggestions phrased as questions. When it last ran is kept in a file on this
// machine, so a restart does not fire it again.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RunnerApi } from "./api.ts";

export const BRIEF_REVIEW_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export const BRIEF_REVIEW_PROMPT =
  "Weekly brief review: read each active client's brief with the client_brief tool. List what looks wrong or missing and which agent should fix it. For anything the brief should hold that it does not, ask: \"I think we should add X. Does that make sense?\"";

export function briefReviewDue(lastIso: string | null, now: Date): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  return Number.isNaN(last) || now.getTime() - last >= BRIEF_REVIEW_GAP_MS;
}

function readLast(file: string): string | null {
  if (!existsSync(file)) return null;
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as { last?: unknown };
    return typeof v.last === "string" ? v.last : null;
  } catch {
    return null;
  }
}

/** Opens the review chat when a week has passed; true when it did. */
export async function runBriefReviewIfDue(d: { api: Pick<RunnerApi, "autoChat">; file: string; now: Date; log?: (l: string) => void }): Promise<boolean> {
  const stamp = () => {
    mkdirSync(dirname(d.file), { recursive: true });
    writeFileSync(d.file, JSON.stringify({ last: d.now.toISOString() }));
  };
  const last = readLast(d.file);
  // A new machine starts the clock rather than reviewing pages nobody has
  // filled yet: the first review is a week after the runner first saw this.
  if (!last) {
    stamp();
    return false;
  }
  if (!briefReviewDue(last, d.now)) return false;
  await d.api.autoChat({ tenantId: null, agent: "manager", title: "Weekly brief review", prompt: BRIEF_REVIEW_PROMPT });
  stamp();
  d.log?.("brief review: opened the Manager's weekly chat");
  return true;
}
