import { describe, it, expect } from "vitest";
import { validateReorderBody, renumber } from "./reorder";

// The pure logic behind both reorder routes (the Operations checklist and its
// task categories): body validation and the id -> sort_order assignment. The
// routes themselves are thin Supabase round-trips.

describe("validateReorderBody", () => {
  it("rejects a missing ids array", () => {
    expect(validateReorderBody({}).ok).toBe(false);
  });

  it("rejects an empty ids array", () => {
    expect(validateReorderBody({ ids: [] }).ok).toBe(false);
  });

  it("rejects non-string entries", () => {
    expect(validateReorderBody({ ids: ["a", 2] }).ok).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(validateReorderBody({ ids: ["a", "b", "a"] }).ok).toBe(false);
  });

  it("accepts a unique string array", () => {
    const r = validateReorderBody({ ids: ["a", "b"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ids).toEqual(["a", "b"]);
  });
});

describe("renumber", () => {
  it("assigns positions in the sent order", () => {
    expect(renumber(["x", "y", "z"], new Set(["x", "y", "z"]))).toEqual([
      { id: "x", sort_order: 0 },
      { id: "y", sort_order: 1 },
      { id: "z", sort_order: 2 },
    ]);
  });

  it("silently drops ids that are not in the allowed set (stale client list)", () => {
    expect(renumber(["x", "gone", "y"], new Set(["x", "y"]))).toEqual([
      { id: "x", sort_order: 0 },
      { id: "y", sort_order: 1 },
    ]);
  });

  it("returns empty when nothing matches", () => {
    expect(renumber(["a"], new Set())).toEqual([]);
  });
});
