import { describe, it, expect } from "vitest";
import { isPlaceholder } from "./tenantGhl";

describe("isPlaceholder", () => {
  it("rejects the three known placeholder values", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("pending")).toBe(true);
    expect(isPlaceholder("env")).toBe(true);
  });
  it("accepts a real value", () => {
    expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
  });
  it("treats null and undefined as placeholder", () => {
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });
});
