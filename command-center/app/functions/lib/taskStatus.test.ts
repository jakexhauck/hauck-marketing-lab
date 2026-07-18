import { describe, it, expect } from "vitest";
import { deriveCoupling, isValidStatus } from "./taskStatus";

describe("isValidStatus", () => {
  it("accepts the three known statuses", () => {
    expect(isValidStatus("todo")).toBe(true);
    expect(isValidStatus("doing")).toBe(true);
    expect(isValidStatus("done")).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isValidStatus("Done")).toBe(false);
    expect(isValidStatus("")).toBe(false);
    expect(isValidStatus("archived")).toBe(false);
    expect(isValidStatus(null)).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
    expect(isValidStatus(3)).toBe(false);
  });
});

describe("deriveCoupling", () => {
  it("checking Done sets status done", () => {
    expect(deriveCoupling({ completed: false, status: "doing" }, { completed: true })).toEqual({
      completed: true,
      status: "done",
    });
  });

  it("un-checking a done row drops it to doing", () => {
    expect(deriveCoupling({ completed: true, status: "done" }, { completed: false })).toEqual({
      completed: false,
      status: "doing",
    });
  });

  it("un-checking a row that was not done leaves the status alone", () => {
    expect(deriveCoupling({ completed: false, status: "todo" }, { completed: false })).toEqual({
      completed: false,
      status: "todo",
    });
  });

  it("setting status done checks the row", () => {
    expect(deriveCoupling({ completed: false, status: "todo" }, { status: "done" })).toEqual({
      completed: true,
      status: "done",
    });
  });

  it("moving status off done un-checks the row", () => {
    expect(deriveCoupling({ completed: true, status: "done" }, { status: "doing" })).toEqual({
      completed: false,
      status: "doing",
    });
  });

  it("setting todo or doing on an unchecked row leaves completed false", () => {
    expect(deriveCoupling({ completed: false, status: "todo" }, { status: "doing" })).toEqual({
      completed: false,
      status: "doing",
    });
    expect(deriveCoupling({ completed: false, status: "doing" }, { status: "todo" })).toEqual({
      completed: false,
      status: "todo",
    });
  });

  it("honours both fields when the caller sends both", () => {
    expect(
      deriveCoupling({ completed: false, status: "todo" }, { completed: true, status: "done" }),
    ).toEqual({ completed: true, status: "done" });
  });

  it("returns the current pair unchanged when neither field is supplied", () => {
    expect(deriveCoupling({ completed: true, status: "done" }, {})).toEqual({
      completed: true,
      status: "done",
    });
  });
});
