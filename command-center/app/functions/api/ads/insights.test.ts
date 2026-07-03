import { describe, it, expect } from "vitest";
import { resolveAdAccount } from "./insights";

// The one piece of real logic in per-client Paid Ads: the client's own ad
// account (from their tenant row) must win over the global env fallback, so no
// client ever sees another client's numbers. If this precedence ever flips,
// every client would inherit the env account. That is the regression this test
// exists to catch.
describe("resolveAdAccount", () => {
  it("prefers the tenant's account over the env fallback", () => {
    expect(resolveAdAccount("act_111", "act_999")).toBe("act_111");
  });

  it("falls back to the env account when the tenant has none (single-tenant deploy)", () => {
    expect(resolveAdAccount(undefined, "act_999")).toBe("act_999");
    expect(resolveAdAccount("", "act_999")).toBe("act_999");
    expect(resolveAdAccount("   ", "act_999")).toBe("act_999");
  });

  it("returns undefined (not-connected) when neither is set", () => {
    expect(resolveAdAccount(undefined, undefined)).toBeUndefined();
    expect(resolveAdAccount("", "")).toBeUndefined();
  });

  it("trims surrounding whitespace on the chosen value", () => {
    expect(resolveAdAccount(" act_111 ", "act_999")).toBe("act_111");
  });
});
