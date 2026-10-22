import { describe, expect, it } from "vitest";
import { activityFrom, CHECKLIST_AREAS, emptyPage, pageForAgent, parsePage, taskArea, type AdsPage } from "./briefPages";
import type { ClientTask } from "./clientTasks";

const EM = String.fromCharCode(0x2014);

function task(over: Partial<ClientTask>): ClientTask {
  return {
    id: "t",
    key: "k",
    phase: "onboard",
    owner: "csm",
    name: "Task",
    position: 0,
    sopKey: null,
    sourceNode: null,
    steps: [],
    state: "todo",
    change: "kept",
    reason: null,
    evidence: null,
    note: null,
    doneBy: null,
    doneAt: null,
    waitsOn: [],
    mode: "ask",
    outputs: {},
    ...over,
  };
}

describe("parsePage", () => {
  it("cleans an ads page: em dashes, bad numbers, unknown status and keys", () => {
    const res = parsePage("ads", {
      campaigns: [{ name: `A ${EM} B`, dailySpend: "x", ads: [{ headline: "h", status: "bogus" }] }],
      extra: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const page = res.data as AdsPage;
    expect(page.campaigns[0].name).toBe("A, B");
    expect(page.campaigns[0].dailySpend).toBeNull();
    expect(page.campaigns[0].ads[0].status).toBe("draft");
    expect(page.campaigns[0].ads[0].headline).toBe("h");
    expect(page.campaigns[0].ads[0].primaryText).toBe("");
    expect("extra" in page).toBe(false);
  });

  it("refuses something that is not an object", () => {
    expect(parsePage("research", "nope").ok).toBe(false);
    expect(parsePage("research", [1]).ok).toBe(false);
  });

  it("keeps long primary text up to its own cap and caps rows", () => {
    const long = "x".repeat(4000);
    const res = parsePage("ads", { campaigns: [{ ads: Array.from({ length: 80 }, () => ({ primaryText: long })) }] });
    if (!res.ok) throw new Error("not ok");
    const ads = (res.data as AdsPage).campaigns[0].ads;
    expect(ads).toHaveLength(50);
    expect(ads[0].primaryText).toHaveLength(4000);
  });

  it("reads a research page with a wrong-typed list as empty", () => {
    const res = parsePage("research", { zips: "bad", stats: { population: 12, competition: "high" } });
    if (!res.ok) throw new Error("not ok");
    expect(res.data).toMatchObject({ zips: [], stats: { population: 12, competition: "high", olderHomesPct: null } });
  });
});

describe("emptyPage", () => {
  it("is empty and complete", () => {
    expect((emptyPage("research") as { zips: unknown[] }).zips).toEqual([]);
    expect((emptyPage("ads") as AdsPage).campaigns).toEqual([]);
  });
});

describe("pageForAgent", () => {
  it("maps research and ads only", () => {
    expect(pageForAgent("research")).toBe("research");
    expect(pageForAgent("ads")).toBe("ads");
    expect(pageForAgent("ghl")).toBeNull();
    expect(pageForAgent("csm")).toBeNull();
  });
});

describe("taskArea", () => {
  it("puts each task in its area", () => {
    expect(taskArea({ phase: "onboard", owner: "csm" })).toBe("onboarding");
    expect(taskArea({ phase: "onboard", owner: "jake" })).toBe("onboarding-call");
    expect(taskArea({ phase: "adsbuild", owner: "research" })).toBe("research");
    expect(taskArea({ phase: "follow", owner: "ghl" })).toBe("ghl");
    expect(taskArea({ phase: "ghl", owner: "jake" })).toBe("ghl");
    expect(taskArea({ phase: "paid", owner: "client" })).toBe("onboarding");
    expect(taskArea({ phase: "launch", owner: "jake" })).toBe("launch-call");
    expect(taskArea({ phase: "nope", owner: "jake" })).toBe("onboarding");
  });

  it("lists the areas in page order", () => {
    expect(CHECKLIST_AREAS.map((a) => a.label)).toEqual([
      "Onboarding",
      "Onboarding Call",
      "Market Research",
      "GHL",
      "Ads",
      "Pre-launch Check",
      "Launch Call",
      "Live",
    ]);
  });
});

describe("activityFrom", () => {
  it("lists doing first, then done newest first", () => {
    const out = activityFrom([
      task({ key: "a", name: "Old", state: "done", doneBy: "ads", doneAt: "2026-10-20T10:00:00Z" }),
      task({ key: "b", name: "New", state: "done", doneBy: "research", doneAt: "2026-10-22T10:00:00Z" }),
      task({ key: "c", name: "Now", state: "doing", owner: "ghl" }),
      task({ key: "d", name: "Todo" }),
    ]);
    expect(out.map((e) => [e.key, e.what, e.who])).toEqual([
      ["c", "doing", "ghl"],
      ["b", "done", "research"],
      ["a", "done", "ads"],
    ]);
  });
});
