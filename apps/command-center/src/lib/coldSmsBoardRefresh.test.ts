import { describe, expect, it } from "vitest";
import { BOARD_REFRESH_MS, boardRefreshInterval } from "./coldSmsBoardRefresh";

const stage = (cards: number) => ({ cards: Array.from({ length: cards }, (_, i) => ({ id: String(i) })) });

describe("boardRefreshInterval", () => {
  it("re-reads every 30 seconds on an ordinary board", () => {
    expect(BOARD_REFRESH_MS).toBe(30_000);
    expect(boardRefreshInterval({ stages: [stage(50), stage(12)] })).toBe(30_000);
  });

  it("stops once a column has loaded more than its first page", () => {
    expect(boardRefreshInterval({ stages: [stage(51)] })).toBe(false);
  });

  it("keeps re-reading a day view, whose columns are not paged", () => {
    expect(boardRefreshInterval({ day: "2026-10-14", stages: [stage(871)] })).toBe(30_000);
  });

  it("re-reads a board that has not loaded yet", () => {
    expect(boardRefreshInterval(undefined)).toBe(30_000);
  });
});
