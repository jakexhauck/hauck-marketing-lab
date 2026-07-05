import { describe, it, expect } from "vitest";
import { resolveAdAccount, derivePhase } from "./insights";

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

// The Overview phase badge only ever shows a real, derived state. A LEARNING ad
// set wins (still optimizing); a finished one reads "scaling"; anything else is
// null so the badge hides rather than fabricating a phase.
describe("derivePhase", () => {
  const active = (status: string) => ({
    effective_status: "ACTIVE",
    learning_stage_info: { status },
  });

  it("returns learning when any active ad set is still LEARNING", () => {
    expect(derivePhase([active("SUCCESS"), active("LEARNING")])).toBe("learning");
  });

  it("returns scaling when learning has finished (SUCCESS / LEARNING_LIMITED)", () => {
    expect(derivePhase([active("SUCCESS")])).toBe("scaling");
    expect(derivePhase([active("LEARNING_LIMITED")])).toBe("scaling");
  });

  it("ignores paused ad sets and returns null when nothing is readable", () => {
    expect(
      derivePhase([{ effective_status: "PAUSED", learning_stage_info: { status: "LEARNING" } }]),
    ).toBeNull();
    expect(derivePhase([])).toBeNull();
    expect(derivePhase([active("")])).toBeNull();
  });
});
