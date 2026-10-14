import { describe, it, expect } from "vitest";
import {
  buildOpportunityIndex,
  buildPipelinePositions,
} from "../../../functions/lib/opportunityIndex";
import type { GhlOpportunity } from "../../../functions/lib/ghl";

const o = (over: Partial<GhlOpportunity>): GhlOpportunity => ({
  id: "o",
  contactId: "c1",
  pipelineId: "p",
  pipelineStageId: "s",
  status: "open",
  updatedAt: "2026-07-01T00:00:00Z",
  ...over,
});

describe("buildOpportunityIndex", () => {
  it("prefers open over won, most recent within open", () => {
    const idx = buildOpportunityIndex([
      o({ id: "1", status: "won", updatedAt: "2026-07-05T00:00:00Z", pipelineStageId: "won" }),
      o({ id: "2", status: "open", updatedAt: "2026-07-02T00:00:00Z", pipelineStageId: "old" }),
      o({ id: "3", status: "open", updatedAt: "2026-07-04T00:00:00Z", pipelineStageId: "new" }),
    ]);
    expect(idx.get("c1")?.pipelineStageId).toBe("new");
  });
  it("falls back to most recent when none open", () => {
    const idx = buildOpportunityIndex([
      o({ id: "1", status: "lost", updatedAt: "2026-07-01T00:00:00Z", pipelineStageId: "a" }),
      o({ id: "2", status: "won", updatedAt: "2026-07-03T00:00:00Z", pipelineStageId: "b" }),
    ]);
    expect(idx.get("c1")?.pipelineStageId).toBe("b");
  });
  it("keys by contact and skips opportunities without a contact", () => {
    const idx = buildOpportunityIndex([
      o({ id: "1", contactId: "c1", pipelineStageId: "x" }),
      o({ id: "2", contactId: undefined, pipelineStageId: "y" }),
      o({ id: "3", contactId: "c2", pipelineStageId: "z" }),
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get("c1")?.pipelineStageId).toBe("x");
    expect(idx.get("c2")?.pipelineStageId).toBe("z");
  });
});

describe("buildPipelinePositions", () => {
  // The whole reason this exists: buildOpportunityIndex above collapses a contact
  // to ONE opportunity, but a past customer with a review request out is in Sales
  // AND Google Reviews at the same time. Both positions must survive.
  it("keeps every pipeline a contact is in, not just the chosen one", () => {
    const idx = buildPipelinePositions([
      o({ id: "1", pipelineId: "sales", pipelineStageId: "job-completed" }),
      o({ id: "2", pipelineId: "reviews", pipelineStageId: "asked" }),
    ]);
    expect(idx.get("c1")).toEqual([
      { pipelineId: "sales", pipelineStageId: "job-completed", status: "open" },
      { pipelineId: "reviews", pipelineStageId: "asked", status: "open" },
    ]);
  });
  it("keeps closed positions too, so status stays the caller's decision", () => {
    const idx = buildPipelinePositions([
      o({ id: "1", pipelineId: "sales", status: "won" }),
      o({ id: "2", pipelineId: "reviews", status: "open" }),
    ]);
    expect(idx.get("c1")?.map((p) => p.status)).toEqual(["won", "open"]);
  });
  it("skips opportunities with no contact, and omits contacts with none", () => {
    const idx = buildPipelinePositions([
      o({ id: "1", contactId: "c1" }),
      o({ id: "2", contactId: undefined }),
    ]);
    expect(idx.size).toBe(1);
    expect(idx.get("c2")).toBeUndefined();
  });
  it("defaults missing ids and status to empty strings rather than undefined", () => {
    const idx = buildPipelinePositions([
      o({ id: "1", pipelineId: undefined, pipelineStageId: undefined, status: undefined }),
    ]);
    expect(idx.get("c1")).toEqual([
      { pipelineId: "", pipelineStageId: "", status: "" },
    ]);
  });
});
