import { describe, it, expect } from "vitest";
import { contactSegment } from "./contactSegments";

const NOW = 1_700_000_000_000; // fixed clock; Date.now() is not used in tests
const DAY = 86_400_000;
const membership = { wonIds: new Set(["c1", "c2"]), openIds: new Set(["c3"]) };

describe("contactSegment", () => {
  it("classifies a recent won contact as a customer", () => {
    const c = { id: "c1", lastActivityAt: new Date(NOW - 5 * DAY).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBe("customers");
  });
  it("classifies a stale won contact as a past customer", () => {
    const c = { id: "c2", lastActivityAt: new Date(NOW - 120 * DAY).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBe("past");
  });
  it("classifies an open-opportunity contact as new", () => {
    const c = { id: "c3", lastActivityAt: new Date(NOW).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBe("new");
  });
  it("returns null for a contact with no opportunity", () => {
    const c = { id: "c9", lastActivityAt: new Date(NOW).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBeNull();
  });
});
