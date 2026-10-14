import { describe, it, expect } from "vitest";
import { buildActionBoard, consequenceOf } from "./settingsActions";
import { CONNECTIONS } from "./connectionRegistry";
import type { ConnectionHealth, ClientConnectionHealth } from "./connectionHealth";
import type { AgencySecretRow } from "./secretsApi";

function health(id: string, over: Partial<ConnectionHealth> = {}): ConnectionHealth {
  return {
    id,
    configured: true,
    missing: [],
    credentials: [],
    probe: { state: "ok", detail: "fine" },
    ...over,
  };
}

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

const ALL_OK = CONNECTIONS.map((d) => health(d.id));

describe("consequenceOf", () => {
  it("names client-facing surfaces first, because those get phone calls", () => {
    const meta = CONNECTIONS.find((c) => c.id === "meta-ads")!;
    const line = consequenceOf(meta);
    expect(line).toContain("Paid Ads");
    // The admin-only Ad Tracker should not crowd out the client surfaces.
    expect(line).not.toContain("Ad Tracker");
  });

  it("collapses tabs of one page into that page, said once", () => {
    // Meta feeds three Paid Ads tabs. Naming each in full made the line three
    // times as long for no extra meaning, which defeats a scan-first layout.
    const meta = CONNECTIONS.find((c) => c.id === "meta-ads")!;
    expect(consequenceOf(meta)).toBe("Paid Ads goes dark.");

    const ga4 = CONNECTIONS.find((c) => c.id === "ga4")!;
    expect(consequenceOf(ga4)).toBe("Website goes dark.");
  });

  it("counts the pages it did not have room to name", () => {
    const ghl = CONNECTIONS.find((c) => c.id === "ghl")!;
    const line = consequenceOf(ghl);
    expect(line).toMatch(/and \d+ more/);
    expect(line).toContain("Inbox");
  });

  it("keeps every consequence short enough to scan", () => {
    for (const def of CONNECTIONS) {
      expect(consequenceOf(def).length, `${def.label} line is too long`).toBeLessThan(90);
    }
  });
});

describe("buildActionBoard", () => {
  it("puts everything healthy on the calm side and leaves no work", () => {
    const board = buildActionBoard({ connections: ALL_OK, clients: [] });
    expect(board.needs).toHaveLength(0);
    expect(board.working).toHaveLength(CONNECTIONS.length);
  });

  it("never files an unverified connection as working", () => {
    // The honesty rule, carried into the layout: the calm column must not imply
    // a probe passed when none ran.
    const board = buildActionBoard({
      connections: [health("ghl", { probe: { state: "skipped", detail: "no probe" } })],
      clients: [],
      defs: CONNECTIONS.filter((c) => c.id === "ghl"),
    });
    expect(board.working).toHaveLength(0);
    expect(board.unverified).toHaveLength(1);
    expect(board.needs).toHaveLength(0);
  });

  it("ranks a broken client above a broken agency key above drift above setup", () => {
    const board = buildActionBoard({
      connections: [
        health("meta-ads", { configured: false, missing: ["META_SYSTEM_USER_TOKEN"], probe: { state: "skipped", detail: "" } }),
        health("google-drive", { probe: { state: "failed", detail: "revoked" } }),
      ],
      clients: [client({ ghlProbe: { state: "failed", detail: "Returned 401" } })],
      agencySecrets: [
        { name: "GA4_SA_JSON", usedBy: ["Google Analytics 4"], optional: false, inDoppler: true, inRuntime: true, masked: "••••1234", drift: true },
      ],
      defs: CONNECTIONS.filter((c) => ["meta-ads", "google-drive"].includes(c.id)),
    });
    expect(board.needs.map((n) => n.severity)).toEqual(["client-down", "down", "drift", "setup"]);
    // The worst item leads and says whose app is down.
    expect(board.needs[0].title).toContain("Willis");
  });

  it("gives a missing credential a paste job and a rejected one a diagnosis", () => {
    const board = buildActionBoard({
      connections: [
        health("meta-ads", { configured: false, missing: ["META_SYSTEM_USER_TOKEN"], probe: { state: "skipped", detail: "" } }),
        health("google-drive", { probe: { state: "failed", detail: "revoked" } }),
      ],
      clients: [],
      defs: CONNECTIONS.filter((c) => ["meta-ads", "google-drive"].includes(c.id)),
    });
    const meta = board.needs.find((n) => n.connectionId === "meta-ads")!;
    const drive = board.needs.find((n) => n.connectionId === "google-drive")!;
    expect(meta.actionLabel).toBe("Add credential");
    expect(meta.credentialName).toBe("META_SYSTEM_USER_TOKEN");
    expect(drive.actionLabel).toBe("See how to fix");
  });

  it("only raises drift, never a matching or uncomparable secret", () => {
    const rows: AgencySecretRow[] = [
      { name: "A", usedBy: [], optional: false, inDoppler: true, inRuntime: true, masked: null, drift: false },
      { name: "B", usedBy: [], optional: false, inDoppler: true, inRuntime: false, masked: null, drift: null },
      { name: "C", usedBy: ["Meta Ads"], optional: false, inDoppler: true, inRuntime: true, masked: null, drift: true },
    ];
    const board = buildActionBoard({ connections: ALL_OK, clients: [], agencySecrets: rows });
    const drifts = board.needs.filter((n) => n.severity === "drift");
    expect(drifts).toHaveLength(1);
    expect(drifts[0].credentialName).toBe("C");
  });

  it("does not flag a client who simply is not using a channel", () => {
    const board = buildActionBoard({
      connections: ALL_OK,
      clients: [client({ set: { ghl: true, "meta-ads": false, ga4: false, "google-places": false } })],
    });
    expect(board.needs).toHaveLength(0);
  });

  it("carries the consequence on every job, so no item is a bare fact", () => {
    const board = buildActionBoard({
      connections: CONNECTIONS.map((d) =>
        health(d.id, { configured: false, missing: ["X"], probe: { state: "skipped", detail: "" } }),
      ),
      clients: [],
    });
    expect(board.needs.length).toBeGreaterThan(5);
    for (const item of board.needs) {
      expect(item.why.length, `${item.title} needs a consequence`).toBeGreaterThan(10);
      expect(item.actionLabel.length).toBeGreaterThan(3);
    }
  });
});
