import { describe, it, expect } from "vitest";
import {
  WORK_BLOCK_CATEGORIES,
  categoryMeta,
  validateBlockTimes,
  dedupeGoogleEvents,
} from "./workBlocks";

describe("work block categories", () => {
  it("exposes the four v1 categories in order", () => {
    expect(WORK_BLOCK_CATEGORIES.map((c) => c.key)).toEqual([
      "deep",
      "client",
      "admin",
      "off",
    ]);
  });

  it("falls back to deep for an unknown key", () => {
    expect(categoryMeta("nope").key).toBe("deep");
    expect(categoryMeta("client").label).toBe("Client");
  });
});

describe("validateBlockTimes", () => {
  it("accepts a valid range", () => {
    expect(
      validateBlockTimes("2026-06-23T09:00:00Z", "2026-06-23T11:00:00Z"),
    ).toBeNull();
  });

  it("rejects end before or equal to start", () => {
    expect(
      validateBlockTimes("2026-06-23T11:00:00Z", "2026-06-23T09:00:00Z"),
    ).toMatch(/end/i);
    expect(
      validateBlockTimes("2026-06-23T09:00:00Z", "2026-06-23T09:00:00Z"),
    ).toMatch(/end/i);
  });

  it("rejects unparseable input", () => {
    expect(validateBlockTimes("nonsense", "2026-06-23T11:00:00Z")).toMatch(
      /valid/i,
    );
  });
});

describe("dedupeGoogleEvents", () => {
  it("drops events already mirrored by a work block", () => {
    const events = [{ id: "g1" }, { id: "g2" }, { id: "g3" }];
    expect(dedupeGoogleEvents(events, ["g2", null, "g3"])).toEqual([
      { id: "g1" },
    ]);
  });
});
