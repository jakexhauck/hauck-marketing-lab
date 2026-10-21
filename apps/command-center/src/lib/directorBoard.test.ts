import { describe, expect, it } from "vitest";
import { blurSave, cellSummary, directorBoard, taskLook } from "./directorBoard";
import type { ClientTask } from "./clientTasks";

const task = (o: Partial<ClientTask>): ClientTask => ({
  id: o.key ?? "x", key: "x", phase: "ghl", owner: "ghl", name: "x", position: 0, sourceNode: null, sopKey: null,
  steps: [], state: "todo", change: "kept", reason: null, evidence: null, note: null, doneBy: null, doneAt: null,
  waitsOn: [], mode: "ask", outputs: {}, ...o,
});

describe("directorBoard", () => {
  const tasks = [
    task({ key: "a", owner: "ghl", phase: "ghl", position: 1, state: "done" }),
    task({ key: "b", owner: "ghl", phase: "ghl", position: 0 }),
    task({ key: "c", owner: "client", phase: "paid" }),
    task({ key: "d", owner: "ghl", phase: "follow", state: "cut" }),
  ];
  const board = directorBoard(tasks);

  it("columns are the Client Fulfillment phases in order", () => {
    expect(board.phases.map((p) => p.id)).toEqual(["paid", "onboard", "ghl", "follow", "adsbuild", "check", "launch", "live"]);
  });

  it("rows follow the owner order and drop owners with no tasks", () => {
    expect(board.rows.map((r) => r.owner)).toEqual(["client", "ghl"]);
    expect(board.rows.map((r) => r.label)).toEqual(["Client", "GHL"]);
  });

  it("each task sits in its phase column, in position order", () => {
    const ghl = board.rows[1];
    expect(ghl.cells[2].map((t) => t.key)).toEqual(["b", "a"]);
    expect(ghl.cells[3].map((t) => t.key)).toEqual(["d"]);
  });

  it("counts done out of the tasks that are not cut", () => {
    expect(board.rows[1]).toMatchObject({ done: 1, total: 2 });
  });
});

describe("blurSave", () => {
  it("saves only what Jake changed since he focused the field", () => {
    expect(blurSave(" New name ", "Old name")).toBe("New name");
    expect(blurSave("Old name", "Old name")).toBeNull();
  });

  it("never writes back text an agent changed while the field sat untouched", () => {
    // Focused with the old text, left as is, while the server moved on.
    expect(blurSave("Old name", "Old name")).toBeNull();
  });

  it("an emptied field clears, a whitespace edit does not count", () => {
    expect(blurSave("", "note")).toBe("");
    expect(blurSave("note  ", "note")).toBeNull();
  });
});

describe("cellSummary", () => {
  const t = (state: ClientTask["state"], position = 0) => task({ key: `${state}${position}`, state, position });

  it("one dot per task in board order, and done out of the tasks not cut", () => {
    const s = cellSummary([t("done", 0), t("todo", 1), t("doing", 2), t("cut", 3)]);
    expect(s.dots.map((d) => d.state)).toEqual(["done", "todo", "doing", "cut"]);
    expect(s).toMatchObject({ done: 1, total: 3 });
  });

  it("an empty cell has no dots and no count", () => {
    expect(cellSummary([])).toEqual({ dots: [], done: 0, total: 0 });
  });
});

describe("taskLook", () => {
  const a = task({ key: "a", owner: "ads" });
  const done = { ...a, state: "done" as const };
  const at = (...ts: ReturnType<typeof task>[]) => new Map(ts.map((t) => [t.key, t]));

  it("waits while anything it waits on is open", () => {
    const b = task({ key: "b", waitsOn: ["a"] });
    expect(taskLook(b, at(a, b))).toBe("waiting");
    expect(taskLook(b, at(done, b))).toBe("todo");
  });

  it("shows Jake's gate as ready once what it waits on is done or cut", () => {
    const gate = task({ key: "g", owner: "jake", waitsOn: ["a"] });
    expect(taskLook(gate, at(a, gate))).toBe("waiting");
    expect(taskLook(gate, at(done, gate))).toBe("ready-gate");
    expect(taskLook(gate, at({ ...a, state: "cut" }, gate))).toBe("ready-gate");
  });

  it("is its own state otherwise, and a Jake task that waits on nothing is a plain to do", () => {
    expect(taskLook(task({ key: "j", owner: "jake" }), at())).toBe("todo");
    expect(taskLook(task({ key: "d", state: "doing", waitsOn: ["a"] }), at(a))).toBe("doing");
    expect(taskLook(task({ key: "x", state: "done" }), at())).toBe("done");
  });
});
