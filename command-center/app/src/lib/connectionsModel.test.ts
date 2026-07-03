import { describe, it, expect } from "vitest";
import {
  CONNECTIONS,
  mergeStatus,
  allConnected,
  type ConnectionStatus,
} from "./connectionsModel";

describe("connectionsModel", () => {
  it("covers the three social platforms and never names the backend", () => {
    const ids = CONNECTIONS.map((c) => c.id);
    for (const id of ["facebook", "instagram", "google"]) {
      expect(ids).toContain(id);
    }
    const blob = JSON.stringify(CONNECTIONS).toLowerCase();
    expect(blob).not.toContain("gohighlevel");
    expect(blob).not.toContain("ghl");
    expect(blob).not.toContain("highlevel");
    expect(blob).not.toContain("leadconnector");
  });

  it("uses no em dashes in any copy", () => {
    expect(JSON.stringify(CONNECTIONS)).not.toContain("—");
  });

  it("merges live status onto the catalog, defaulting missing to unknown", () => {
    const statuses: ConnectionStatus[] = [
      { id: "facebook", state: "connected" },
      { id: "google", state: "action_needed" },
    ];
    const m = mergeStatus(statuses);
    expect(m.facebook).toBe("connected");
    expect(m.google).toBe("action_needed");
    expect(m.instagram).toBe("unknown");
  });

  it("mergeStatus handles undefined input", () => {
    const m = mergeStatus(undefined);
    expect(m.facebook).toBe("unknown");
  });

  it("allConnected is true only when every platform is connected", () => {
    expect(
      allConnected({ facebook: "connected", instagram: "connected", google: "connected" }),
    ).toBe(true);
    expect(
      allConnected({ facebook: "connected", instagram: "action_needed", google: "connected" }),
    ).toBe(false);
  });
});
