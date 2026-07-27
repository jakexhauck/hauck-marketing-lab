import { describe, it, expect } from "vitest";
import {
  deriveState,
  stateReason,
  needsAttention,
  summarize,
  clientRowState,
  type ConnectionHealth,
  type ClientConnectionHealth,
} from "./connectionHealth";
import type { ConnectionDef } from "./connectionRegistry";

function health(over: Partial<ConnectionHealth> = {}): ConnectionHealth {
  return {
    id: "x",
    configured: true,
    missing: [],
    credentials: [],
    probe: { state: "ok", detail: "fine" },
    ...over,
  };
}

describe("deriveState", () => {
  it("is live only when a probe actually succeeded", () => {
    expect(deriveState(health())).toBe("live");
  });

  it("is down when a present credential is rejected by the vendor", () => {
    expect(deriveState(health({ probe: { state: "failed", detail: "401" } }))).toBe("down");
  });

  it("never calls an unprobed credential live", () => {
    // The whole point: a token we cannot test is not a token we can trust.
    expect(deriveState(health({ probe: { state: "skipped", detail: "no probe" } }))).toBe(
      "unverified",
    );
  });

  it("reports a missing credential as unconfigured, outranking the probe", () => {
    const h = health({
      configured: false,
      missing: ["META_SYSTEM_USER_TOKEN"],
      probe: { state: "skipped", detail: "No token set" },
    });
    expect(deriveState(h)).toBe("unconfigured");
    expect(stateReason(h)).toBe("Missing: META_SYSTEM_USER_TOKEN");
  });

  it("treats an absent health entry as unverified, not as working", () => {
    expect(deriveState(undefined)).toBe("unverified");
    expect(stateReason(undefined)).toBe("Not checked");
  });
});

describe("needsAttention", () => {
  it("flags broken and never-set-up, and leaves unverified alone", () => {
    expect(needsAttention("down")).toBe(true);
    expect(needsAttention("unconfigured")).toBe(true);
    expect(needsAttention("unverified")).toBe(false);
    expect(needsAttention("live")).toBe(false);
  });
});

describe("summarize", () => {
  const defs = [{ id: "a" }, { id: "b" }, { id: "c" }] as ConnectionDef[];

  it("counts every registry entry, including ones the probe never reported", () => {
    const summary = summarize(
      [health({ id: "a" }), health({ id: "b", probe: { state: "failed", detail: "dead" } })],
      defs,
    );
    expect(summary.total).toBe(3);
    expect(summary.live).toBe(1);
    expect(summary.down).toBe(1);
    // "c" was absent from the response and must still be accounted for.
    expect(summary.unverified).toBe(1);
    expect(summary.attention).toBe(1);
  });
});

describe("clientRowState", () => {
  function client(over: Partial<ClientConnectionHealth> = {}): ClientConnectionHealth {
    return {
      tenantId: "t1",
      name: "Willis",
      slug: "willis-windows",
      set: { ghl: true, "meta-ads": true, ga4: false, "google-places": false },
      ghlProbe: { state: "ok", detail: "accepted" },
      ...over,
    };
  }

  it("uses the live probe for GHL and presence for the rest", () => {
    const row = clientRowState(client());
    expect(row.states.ghl).toBe("live");
    expect(row.states["meta-ads"]).toBe("unverified");
    expect(row.states.ga4).toBe("unconfigured");
    expect(row.attention).toBe(0);
  });

  it("counts a rejected client token as needing attention", () => {
    const row = clientRowState(client({ ghlProbe: { state: "failed", detail: "401" } }));
    expect(row.states.ghl).toBe("down");
    expect(row.attention).toBe(1);
  });

  it("does not treat an unconnected client as broken", () => {
    // A client with no ad account is not a fault, they are just not running ads.
    const row = clientRowState(
      client({ set: { ghl: true, "meta-ads": false, ga4: false, "google-places": false } }),
    );
    expect(row.states["meta-ads"]).toBe("unconfigured");
    expect(row.attention).toBe(0);
  });
});
