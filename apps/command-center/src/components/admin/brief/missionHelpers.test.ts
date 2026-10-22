import { describe, expect, it } from "vitest";
import { adsStats, ago, areaGroups, checklistStats, resolveMissionPage } from "./missionHelpers";
import { emptyPage, parsePage, type AdsPage } from "../../../lib/briefPages";
import type { ClientTask } from "../../../lib/clientTasks";

function task(over: Partial<ClientTask>): ClientTask {
  return {
    id: "t", key: "k", phase: "onboard", owner: "csm", name: "Task", position: 0, sopKey: null, sourceNode: null, steps: [],
    state: "todo", change: "kept", reason: null, evidence: null, note: null, doneBy: null, doneAt: null, waitsOn: [], mode: "ask", outputs: {},
    ...over,
  };
}

describe("resolveMissionPage", () => {
  it("defaults to Client Information", () => {
    expect(resolveMissionPage("ads")).toBe("ads");
    expect(resolveMissionPage("nope")).toBe("client");
    expect(resolveMissionPage(null)).toBe("client");
  });
});

describe("areaGroups and checklistStats", () => {
  it("groups by area in page order, leaves cut tasks out", () => {
    const tasks = [
      task({ key: "a", phase: "launch", owner: "jake" }),
      task({ key: "b", phase: "onboard", owner: "csm", state: "done" }),
      task({ key: "c", phase: "adsbuild", owner: "research", state: "doing" }),
      task({ key: "d", phase: "onboard", owner: "jake", state: "cut" }),
    ];
    expect(areaGroups(tasks).map((g) => [g.area, g.done, g.total])).toEqual([
      ["onboarding", 1, 1],
      ["research", 0, 1],
      ["launch-call", 0, 1],
    ]);
    expect(checklistStats(tasks)).toEqual({ done: 1, total: 3, agentsWorking: 1, waitingOnJake: 1 });
  });

  it("is empty for no tasks", () => {
    expect(areaGroups([])).toEqual([]);
    expect(checklistStats([])).toEqual({ done: 0, total: 0, agentsWorking: 0, waitingOnJake: 0 });
  });
});

describe("adsStats", () => {
  it("sums spend, counts ads that exist, earliest launch", () => {
    const res = parsePage("ads", {
      campaigns: [
        { dailySpend: 40, objective: "Leads", launchDate: "2026-11-10", ads: [{ status: "approved" }, { status: "not_made" }] },
        { dailySpend: 20, objective: "Leads", launchDate: "2026-11-03", ads: [{ status: "draft" }] },
      ],
    });
    if (!res.ok) throw new Error("bad");
    expect(adsStats(res.data as AdsPage)).toEqual({ dailySpend: 60, adsAtLaunch: 2, objective: "Leads", launchDate: "2026-11-03" });
  });

  it("is blank for an empty page", () => {
    expect(adsStats(emptyPage("ads"))).toEqual({ dailySpend: null, adsAtLaunch: 0, objective: "", launchDate: "" });
  });
});

describe("ago", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("reads naturally", () => {
    expect(ago(null, now)).toBe("");
    expect(ago("2026-10-22T11:56:00Z", now)).toBe("4 min ago");
    expect(ago("2026-10-21T10:00:00Z", now)).toBe("yesterday");
  });
});
