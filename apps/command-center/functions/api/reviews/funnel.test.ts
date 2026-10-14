import { describe, expect, it } from "vitest";
import type { GhlOpportunity } from "../../lib/ghl";
import {
  classifyReviewStage,
  resolveReviewPipeline,
  rollupReviewFunnel,
} from "./funnel";

// The confirmed Willis pipeline, each stage tied to a GHL automation.
const PIPE = {
  id: "p1",
  name: "Google Reviews",
  stages: [
    { id: "s-asked", name: "Asked for review" },
    { id: "s-clicked", name: "Review link clicked" },
    { id: "s-pos", name: "Positive review submission" },
    { id: "s-neg", name: "Negative feedback received" },
  ],
};

function opp(stageId: string, over: Partial<GhlOpportunity> = {}): GhlOpportunity {
  return { id: `o-${stageId}`, pipelineStageId: stageId, ...over };
}

describe("classifyReviewStage", () => {
  it("maps the four real stages to the right buckets", () => {
    expect(classifyReviewStage("Asked for review")).toBe("pending");
    expect(classifyReviewStage("Review link clicked")).toBe("clicked");
    expect(classifyReviewStage("Positive review submission")).toBe("positive");
    expect(classifyReviewStage("Negative feedback received")).toBe("negative");
  });

  it("does not let the bare word 'review' pull a click/ask stage into positive", () => {
    expect(classifyReviewStage("Review Link Clicked")).toBe("clicked");
    expect(classifyReviewStage("Asked For A Review")).toBe("pending");
  });

  it("handles loose renames", () => {
    expect(classifyReviewStage("Left a review")).toBe("positive");
    expect(classifyReviewStage("Private feedback")).toBe("negative");
    expect(classifyReviewStage("Review submitted")).toBe("positive");
  });
});

describe("resolveReviewPipeline", () => {
  it("resolves by name", () => {
    expect(resolveReviewPipeline([{ id: "x", name: "Sales", stages: [] }, PIPE])?.id).toBe("p1");
  });
  it("falls back to the gate stage signature when the name lacks 'review'", () => {
    const renamed = { ...PIPE, name: "Reputation Engine (no r-word here)" };
    // name contains "reputation" -> still matches by name; drop that too:
    const generic = { ...PIPE, name: "Feedback Loop" };
    expect(resolveReviewPipeline([generic])?.id).toBe("p1");
    expect(resolveReviewPipeline([renamed])?.id).toBe("p1");
  });
  it("returns null when nothing matches", () => {
    expect(resolveReviewPipeline([{ id: "x", name: "Sales", stages: [{ id: "a", name: "New Lead" }] }])).toBeNull();
  });
});

describe("rollupReviewFunnel", () => {
  it("computes a cumulative funnel: asked >= clicked >= positive", () => {
    const opps: GhlOpportunity[] = [
      opp("s-asked"),
      opp("s-asked"),
      opp("s-clicked"),
      opp("s-pos"),
      opp("s-pos"),
      opp("s-neg"),
    ];
    const r = rollupReviewFunnel(PIPE, opps);
    expect(r.asked).toBe(6); // everyone was asked
    expect(r.pending).toBe(2); // still in "Asked for review"
    expect(r.clicked).toBe(4); // 1 clicked + 2 positive + 1 negative
    expect(r.positive).toBe(2);
    expect(r.negative).toBe(1);
    expect(r.asked).toBeGreaterThanOrEqual(r.clicked);
    expect(r.clicked).toBeGreaterThanOrEqual(r.positive);
  });

  it("lists only positive submissions in recent, newest first", () => {
    const opps: GhlOpportunity[] = [
      opp("s-pos", { contact: { name: "Old Win" }, lastStatusChangeAt: "2026-01-01" }),
      opp("s-pos", { contact: { name: "New Win" }, lastStatusChangeAt: "2026-06-01" }),
      opp("s-neg", { contact: { name: "Unhappy" }, lastStatusChangeAt: "2026-07-01" }),
    ];
    const r = rollupReviewFunnel(PIPE, opps);
    expect(r.recent.map((x) => x.name)).toEqual(["New Win", "Old Win"]);
    expect(r.recent[0].initials).toBe("NW");
  });

  it("treats an empty pipeline as all-zero", () => {
    const r = rollupReviewFunnel(PIPE, []);
    expect(r).toMatchObject({ asked: 0, clicked: 0, positive: 0, negative: 0, pending: 0 });
    expect(r.recent).toEqual([]);
  });
});
