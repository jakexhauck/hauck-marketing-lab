// The hybrid status engine. Structure comes from pillars.ts; live numbers come
// from real data where a source exists. liveStatus resolves what to show: if a
// node declares a scoreboard metricKey and that metric has real data, the node
// is "live"; otherwise it falls back to its declared status. As real features
// land and feed metrics, pillars light up from planned -> building -> live on
// their own.

import { PILLARS, type Pillar, type PillarLane, type PillarStatus } from "./pillars";

export type LiveData = Record<string, number | string>;

const RANK: Record<PillarStatus, number> = { planned: 0, building: 1, live: 2 };

export function getPillar(id: string): Pillar | undefined {
  return PILLARS.find((p) => p.id === id);
}

export function getLane(pillarId: string, laneId: string): PillarLane | undefined {
  return getPillar(pillarId)?.lanes.find((l) => l.id === laneId);
}

// Operations ('hub') first, then the value chain by ascending number.
export function orderedPillars(): Pillar[] {
  return [...PILLARS].sort((a, b) => {
    if (a.order === "hub") return -1;
    if (b.order === "hub") return 1;
    return (a.order as number) - (b.order as number);
  });
}

function hasMetric(node: Pillar | PillarLane, live?: LiveData): boolean {
  if (!live || !node.scoreboard) return false;
  return node.scoreboard.some((f) => {
    if (!f.metricKey) return false;
    const v = live[f.metricKey];
    return v !== undefined && v !== null && v !== "" && v !== 0;
  });
}

// Declared status, promoted to "live" when a real metric is present.
export function liveStatus(node: Pillar | PillarLane, live?: LiveData): PillarStatus {
  if (hasMetric(node, live)) return "live";
  return node.status ?? "planned";
}

// A pillar's status is the highest of its lanes (so a pillar with one live lane
// reads as live on the map), promoted by its own metrics where present.
export function rollUpStatus(p: Pillar, live?: LiveData): PillarStatus {
  let best: PillarStatus = liveStatus(p, live);
  for (const lane of p.lanes) {
    const s = liveStatus(lane, live);
    if (RANK[s] > RANK[best]) best = s;
  }
  return best;
}
