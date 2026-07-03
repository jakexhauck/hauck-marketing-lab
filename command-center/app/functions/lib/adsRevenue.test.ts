import { describe, it, expect } from "vitest";
import {
  resolveCompletedStage,
  completedInMonth,
  tallyRevenue,
  hasAdTag,
} from "./adsRevenue";
import type { GhlOpportunity } from "./ghl";

const ZONE = "America/Chicago";

// A completed-job opp completing on the given ISO instant.
function opp(over: Partial<GhlOpportunity>): GhlOpportunity {
  return { id: "o1", pipelineStageId: "stage-done", contactId: "c1", lastStatusChangeAt: "2026-07-03T12:00:00Z", monetaryValue: 1000, ...over };
}

describe("resolveCompletedStage", () => {
  const pipes = [
    { id: "paid", name: "Paid Ad's Pipeline", stages: [{ id: "s1", name: "Lead In" }] },
    { id: "sales", name: "Sales Pipeline", stages: [
      { id: "sched", name: "Estimate Scheduled" },
      { id: "done", name: "Job Completed" },
    ] },
  ];

  it("finds the Sales pipeline + Job Completed stage by name", () => {
    expect(resolveCompletedStage(pipes)).toEqual({ pipelineId: "sales", stageId: "done" });
  });

  it("tolerates a renamed Sales pipeline via contains", () => {
    const renamed = [{ id: "s", name: "2026 Sales", stages: [{ id: "d", name: "Job Completed!" }] }];
    expect(resolveCompletedStage(renamed)).toEqual({ pipelineId: "s", stageId: "d" });
  });

  it("returns null when there is no completed stage", () => {
    const none = [{ id: "s", name: "Sales Pipeline", stages: [{ id: "x", name: "Lead In" }] }];
    expect(resolveCompletedStage(none)).toBeNull();
  });
});

describe("completedInMonth", () => {
  it("keeps only this-month completions in the target stage", () => {
    const opps = [
      opp({ id: "keep", lastStatusChangeAt: "2026-07-15T10:00:00Z" }),
      opp({ id: "last-month", lastStatusChangeAt: "2026-06-30T10:00:00Z" }),
      opp({ id: "wrong-stage", pipelineStageId: "stage-open" }),
      opp({ id: "no-contact", contactId: undefined, contact: undefined }),
    ];
    const out = completedInMonth(opps, "stage-done", "2026-07", ZONE);
    expect(out.map((o) => o.id)).toEqual(["keep"]);
  });

  it("sorts newest completion first", () => {
    const opps = [
      opp({ id: "older", lastStatusChangeAt: "2026-07-02T10:00:00Z" }),
      opp({ id: "newer", lastStatusChangeAt: "2026-07-20T10:00:00Z" }),
    ];
    expect(completedInMonth(opps, "stage-done", "2026-07", ZONE).map((o) => o.id)).toEqual(["newer", "older"]);
  });

  it("respects the tenant zone at a month boundary", () => {
    // 2026-08-01T02:00Z is still 2026-07-31 21:00 in Chicago (CDT, -5h).
    const opps = [opp({ id: "edge", lastStatusChangeAt: "2026-08-01T02:00:00Z" })];
    expect(completedInMonth(opps, "stage-done", "2026-07", ZONE).map((o) => o.id)).toEqual(["edge"]);
    expect(completedInMonth(opps, "stage-done", "2026-08", ZONE)).toEqual([]);
  });
});

describe("tallyRevenue", () => {
  it("sums monetaryValue and counts customers", () => {
    const won = [opp({ monetaryValue: 1200 }), opp({ monetaryValue: 800 }), opp({ monetaryValue: undefined })];
    expect(tallyRevenue(won)).toEqual({ customers: 3, revenue: 2000 });
  });

  it("is zero for no wins", () => {
    expect(tallyRevenue([])).toEqual({ customers: 0, revenue: 0 });
  });
});

describe("hasAdTag", () => {
  it("matches the facebook ads tag case-insensitively and by contains", () => {
    expect(hasAdTag(["Facebook Ads"])).toBe(true);
    expect(hasAdTag(["facebook ad"])).toBe(true);
    expect(hasAdTag(["VIP", "  FACEBOOK ADS  "])).toBe(true);
  });

  it("is false without the tag", () => {
    expect(hasAdTag(["referral", "google"])).toBe(false);
    expect(hasAdTag(undefined)).toBe(false);
  });
});
