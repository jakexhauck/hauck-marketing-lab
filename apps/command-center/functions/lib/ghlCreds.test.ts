import { describe, expect, it, vi } from "vitest";
import { APP_LINKED_TOKEN, isAppLinked, resolveTenantGhl } from "./ghlCreds";

describe("resolveTenantGhl", () => {
  it("returns the pasted token untouched for a PIT tenant", async () => {
    const mint = vi.fn(async (loc: string) => `minted-${loc}`);
    const t = { ghl_location_id: "LOC1", ghl_token: "pit-abc" };
    expect(await resolveTenantGhl(t, mint)).toEqual({ locationId: "LOC1", token: "pit-abc" });
    expect(mint).not.toHaveBeenCalled();
  });

  it("mints for an app-linked tenant", async () => {
    const mint = vi.fn(async (loc: string) => `minted-${loc}`);
    const t = { ghl_location_id: "LOC2", ghl_token: APP_LINKED_TOKEN };
    expect(await resolveTenantGhl(t, mint)).toEqual({ locationId: "LOC2", token: "minted-LOC2" });
  });

  it("is null when the app cannot mint (uninstalled, agency token dead)", async () => {
    const t = { ghl_location_id: "LOC3", ghl_token: APP_LINKED_TOKEN };
    expect(await resolveTenantGhl(t, async () => null)).toBeNull();
  });

  it("is null for placeholders, and never mints for them", async () => {
    const mint = vi.fn(async () => "x");
    for (const tok of ["", "pending", "env"]) {
      expect(await resolveTenantGhl({ ghl_location_id: "LOC", ghl_token: tok }, mint)).toBeNull();
    }
    expect(
      await resolveTenantGhl({ ghl_location_id: "pending", ghl_token: APP_LINKED_TOKEN }, mint),
    ).toBeNull();
    expect(mint).not.toHaveBeenCalled();
  });
});

describe("isAppLinked", () => {
  it("is true only for the sentinel", () => {
    expect(isAppLinked({ ghl_token: "app" })).toBe(true);
    expect(isAppLinked({ ghl_token: "pit-abc" })).toBe(false);
    expect(isAppLinked({ ghl_token: null })).toBe(false);
  });
});
