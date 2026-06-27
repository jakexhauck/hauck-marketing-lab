import { describe, it, expect } from "vitest";
import { getPillar, getLane, orderedPillars, liveStatus, rollUpStatus } from "./pillarStatus";
import { PILLARS, type PillarLane } from "./pillars";

describe("pillar config", () => {
  it("has the six pillars", () => {
    const ids = PILLARS.map((p) => p.id).sort();
    expect(ids).toEqual(["onboarding", "operations", "outreach", "retention", "sales", "service"].sort());
  });

  it("orders operations (hub) first, then by number", () => {
    const ordered = orderedPillars();
    expect(ordered[0].id).toBe("operations");
    expect(ordered.slice(1).map((p) => p.num)).toEqual(["01", "02", "03", "04", "05"]);
  });

  it("looks up a pillar and a lane", () => {
    expect(getPillar("service")?.label).toBe("Service Delivery");
    expect(getLane("service", "software")?.label.toLowerCase()).toContain("software");
    expect(getLane("service", "nope")).toBeUndefined();
  });

  it("software lane carries delivery process + tool links", () => {
    const lane = getLane("service", "software")!;
    expect(lane.process && lane.process.length).toBeGreaterThan(2);
    expect(lane.links && lane.links.length).toBeGreaterThan(0);
  });

  it("every pillar is a workspace: has tabs, a team, and a tasks tab", () => {
    for (const p of PILLARS) {
      expect(p.tabs.length).toBeGreaterThan(0);
      expect(Array.isArray(p.team)).toBe(true);
      expect(Array.isArray(p.tasks)).toBe(true);
      // Tasks tab is on every pillar.
      expect(p.tabs.some((t) => t.kind === "tasks")).toBe(true);
    }
  });

  it("operations holds the stack tab (clients live in its overview)", () => {
    const ops = getPillar("operations")!;
    const kinds = ops.tabs.map((t) => t.kind);
    expect(kinds).toContain("stack");
    expect(kinds).toContain("overview");
  });
});

describe("liveStatus", () => {
  it("falls back to a lane's declared status with no live data", () => {
    const lane = getLane("service", "website")!;
    expect(liveStatus(lane)).toBe("building");
  });

  it("promotes a lane to live when its metric has real data", () => {
    const planned: PillarLane = {
      id: "x",
      label: "X",
      what: "",
      emoji: "🧪",
      status: "planned",
      scoreboard: [{ label: "Clients", metricKey: "activeClients" }],
    };
    expect(liveStatus(planned)).toBe("planned");
    expect(liveStatus(planned, { activeClients: 1 })).toBe("live");
    // zero / empty is not "real data", so no promotion
    expect(liveStatus(planned, { activeClients: 0 })).toBe("planned");
  });
});

describe("rollUpStatus", () => {
  it("reads live when any lane is live", () => {
    // service has software + paid-ads as live lanes
    expect(rollUpStatus(getPillar("service")!)).toBe("live");
  });

  it("reads planned when every lane is planned", () => {
    expect(rollUpStatus(getPillar("outreach")!)).toBe("planned");
  });
});
