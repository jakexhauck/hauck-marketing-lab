import { describe, expect, it } from "vitest";
import { chunk } from "./ga4";

describe("chunk", () => {
  it("splits into groups of at most size, preserving order", () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
  });

  it("returns a single group when under the size", () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunk([], 5)).toEqual([]);
  });
});
