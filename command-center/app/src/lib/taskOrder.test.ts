import { describe, it, expect } from "vitest";
import { moveItem, moveWithinSubset, openFirst } from "./taskOrder";

// Pure list mechanics behind the Operations checklist's drag-to-reorder. The
// hook applies these optimistically; the server persists the same order.

describe("moveItem", () => {
  const list = ["a", "b", "c", "d"];

  it("moves an item forward", () => {
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward", () => {
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns the same order for a no-op move", () => {
    expect(moveItem(list, 2, 2)).toEqual(list);
  });

  it("does not mutate the input", () => {
    moveItem(list, 0, 3);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps out-of-range targets instead of dropping items", () => {
    expect(moveItem(list, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(list, 3, -5)).toEqual(["d", "a", "b", "c"]);
  });
});

describe("openFirst", () => {
  it("sinks completed rows below open ones, keeping relative order", () => {
    const rows = [
      { id: "1", completed: true },
      { id: "2", completed: false },
      { id: "3", completed: true },
      { id: "4", completed: false },
    ];
    expect(openFirst(rows).map((r) => r.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("leaves an already-partitioned list untouched", () => {
    const rows = [
      { id: "1", completed: false },
      { id: "2", completed: true },
    ];
    expect(openFirst(rows)).toEqual(rows);
  });
});

describe("moveWithinSubset", () => {
  // Stored order, with the "Agency" rows scattered through it. The filtered
  // view shows only a, c, e.
  const all = [
    { id: "a" },
    { id: "other1" },
    { id: "c" },
    { id: "other2" },
    { id: "e" },
  ];
  const visible = ["a", "c", "e"];
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it("moves a row inside the filtered view without moving anything hidden", () => {
    // Drag "e" (visible index 2) to the top of the Agency view.
    expect(ids(moveWithinSubset(all, visible, 2, 0))).toEqual([
      "e",
      "other1",
      "a",
      "other2",
      "c",
    ]);
  });

  it("keeps the hidden rows in exactly their stored positions", () => {
    const next = moveWithinSubset(all, visible, 0, 2);
    expect(next[1].id).toBe("other1");
    expect(next[3].id).toBe("other2");
  });

  it("puts the visible rows in the order the filtered view will show", () => {
    const next = moveWithinSubset(all, visible, 0, 2);
    expect(next.filter((r) => visible.includes(r.id)).map((r) => r.id)).toEqual([
      "c",
      "e",
      "a",
    ]);
  });

  it("behaves exactly like moveItem when everything is visible", () => {
    const everything = all.map((r) => r.id);
    expect(ids(moveWithinSubset(all, everything, 0, 3))).toEqual(ids(moveItem(all, 0, 3)));
  });

  it("returns the order unchanged for a no-op or an out-of-range move", () => {
    expect(ids(moveWithinSubset(all, visible, 1, 1))).toEqual(ids(all));
    expect(ids(moveWithinSubset(all, visible, 9, 0))).toEqual(ids(all));
    expect(ids(moveWithinSubset(all, visible, -1, 0))).toEqual(ids(all));
  });

  it("clamps a drop past the end of the filtered view", () => {
    // Index 2 is the last visible row, so dropping "a" at 9 lands it there.
    expect(ids(moveWithinSubset(all, visible, 0, 9))).toEqual([
      "c",
      "other1",
      "e",
      "other2",
      "a",
    ]);
  });

  it("ignores an id that is not in the list at all", () => {
    expect(ids(moveWithinSubset(all, ["a", "ghost", "c"], 1, 0))).toEqual([
      "c",
      "other1",
      "a",
      "other2",
      "e",
    ]);
  });

  it("does not mutate what it was given", () => {
    const input = [{ id: "x" }, { id: "y" }];
    moveWithinSubset(input, ["x", "y"], 0, 1);
    expect(ids(input)).toEqual(["x", "y"]);
  });

  it("does nothing when the filter is showing a single row", () => {
    expect(ids(moveWithinSubset(all, ["c"], 0, 0))).toEqual(ids(all));
  });
});
