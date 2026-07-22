import { describe, it, expect } from "vitest";
import { moveItem, openFirst } from "./taskOrder";

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
