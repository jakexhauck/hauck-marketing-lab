import { describe, it, expect } from "vitest";
import { isRetiredTenant } from "./retiredTenant";

describe("isRetiredTenant", () => {
  it("catches a tenant renamed RETIRED, in any case", () => {
    expect(isRetiredTenant({ name: "RETIRED 2026-08-09 - merged into Made Better Landscaping Co" })).toBe(true);
    expect(isRetiredTenant({ name: "  retired test" })).toBe(true);
  });

  it("leaves real clients alone, including a name that only contains the word", () => {
    expect(isRetiredTenant({ name: "Made Better Landscaping Co" })).toBe(false);
    expect(isRetiredTenant({ name: "Retiredly Roofing" })).toBe(false);
    expect(isRetiredTenant({ name: null })).toBe(false);
  });
});
