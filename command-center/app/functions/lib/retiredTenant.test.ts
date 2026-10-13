import { describe, it, expect } from "vitest";
import { isNotAClient, isRetiredTenant } from "./retiredTenant";

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

describe("isNotAClient", () => {
  it("leaves out retired tenants and the agency's own sub-account", () => {
    expect(isNotAClient({ name: "RETIRED test", slug: "test-account" })).toBe(true);
    expect(isNotAClient({ name: "Hauck Marketing", slug: "hauck-marketing" })).toBe(true);
  });

  it("keeps real clients", () => {
    expect(isNotAClient({ name: "Willis Windows", slug: "willis-windows" })).toBe(false);
    expect(isNotAClient({ name: "Hauck Marketing Roofing", slug: "hauck-marketing-roofing" })).toBe(false);
  });
});
