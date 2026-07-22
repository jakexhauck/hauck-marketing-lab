import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUndoQueue } from "./undoQueue";

describe("createUndoQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not commit inside the undo window", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 6500, commit });

    q.schedule("t1", { id: "t1" });
    vi.advanceTimersByTime(6499);

    expect(commit).not.toHaveBeenCalled();
    expect(q.pendingCount()).toBe(1);
  });

  it("commits once the window closes", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 6500, commit });

    q.schedule("t1", { id: "t1" });
    vi.advanceTimersByTime(6500);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({ id: "t1" });
    expect(q.pendingCount()).toBe(0);
  });

  it("undo cancels the commit entirely", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 6500, commit });

    q.schedule("t1", { id: "t1" });
    expect(q.undo("t1")).toBe(true);
    vi.advanceTimersByTime(60_000);

    expect(commit).not.toHaveBeenCalled();
    expect(q.pendingCount()).toBe(0);
  });

  it("undo after the window reports false and does not resurrect anything", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 6500, commit });

    q.schedule("t1", { id: "t1" });
    vi.advanceTimersByTime(6500);

    expect(q.undo("t1")).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("tracks several deletes independently", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 6500, commit });

    q.schedule("a", { id: "a" });
    q.schedule("b", { id: "b" });
    q.undo("a");
    vi.advanceTimersByTime(6500);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({ id: "b" });
  });

  it("re-scheduling the same key restarts the window instead of double-committing", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 6500, commit });

    q.schedule("a", { id: "a" });
    vi.advanceTimersByTime(5000);
    q.schedule("a", { id: "a" });
    vi.advanceTimersByTime(5000);
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("flushAll commits pending deletes immediately", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const q = createUndoQueue({ delayMs: 6500, commit });

    q.schedule("a", { id: "a" });
    q.schedule("b", { id: "b" });
    q.flushAll();

    expect(commit).toHaveBeenCalledTimes(2);
    expect(q.pendingCount()).toBe(0);

    // Nothing left to fire on the old timers.
    vi.advanceTimersByTime(60_000);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("hands the item back when the commit fails", async () => {
    const err = new Error("500");
    const commit = vi.fn().mockRejectedValue(err);
    const onCommitError = vi.fn();
    const q = createUndoQueue({ delayMs: 6500, commit, onCommitError });

    q.schedule("a", { id: "a" });
    vi.advanceTimersByTime(6500);
    await vi.waitFor(() => expect(onCommitError).toHaveBeenCalled());

    expect(onCommitError).toHaveBeenCalledWith({ id: "a" }, err);
  });
});
