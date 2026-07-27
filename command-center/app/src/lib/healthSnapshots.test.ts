import { describe, it, expect } from "vitest";
import {
  snapshotFrom,
  diffSnapshots,
  type HealthSnapshotRow,
} from "./healthSnapshots";
import type { HealthResponse } from "./connectionHealth";

function row(connectionId: string, state: HealthSnapshotRow["state"]): HealthSnapshotRow {
  return { connectionId, label: connectionId, state, detail: "" };
}

describe("diffSnapshots", () => {
  it("says nothing when a broken row stays broken", () => {
    // The entire reason this function exists. Alerting on every red row every
    // 30 minutes trains you to ignore the alerts, which is worse than silence.
    const before = [row("meta-ads", "down")];
    const after = [row("meta-ads", "down")];
    const { broke, recovered } = diffSnapshots(before, after);
    expect(broke).toEqual([]);
    expect(recovered).toEqual([]);
  });

  it("says nothing when a working row keeps working", () => {
    const { broke, recovered } = diffSnapshots([row("ghl", "live")], [row("ghl", "live")]);
    expect(broke).toEqual([]);
    expect(recovered).toEqual([]);
  });

  it("reports a row that went from working to broken", () => {
    const { broke } = diffSnapshots([row("meta-ads", "live")], [row("meta-ads", "down")]);
    expect(broke.map((r) => r.connectionId)).toEqual(["meta-ads"]);
  });

  it("treats a credential vanishing as a break, not as a fresh install", () => {
    // live -> unconfigured means the value was deleted from the environment.
    // That is the exact signature of the "login unavailable" outage, where a
    // careless env:set blanked every other secret on its way through.
    const { broke } = diffSnapshots([row("supabase", "live")], [row("supabase", "unconfigured")]);
    expect(broke.map((r) => r.connectionId)).toEqual(["supabase"]);
  });

  it("reports a recovery when a broken row comes back", () => {
    const { broke, recovered } = diffSnapshots([row("ga4", "down")], [row("ga4", "live")]);
    expect(broke).toEqual([]);
    expect(recovered.map((r) => r.connectionId)).toEqual(["ga4"]);
  });

  it("counts unconfigured to live as a recovery too", () => {
    const { recovered } = diffSnapshots(
      [row("google-drive", "unconfigured")],
      [row("google-drive", "live")],
    );
    expect(recovered.map((r) => r.connectionId)).toEqual(["google-drive"]);
  });

  it("never alerts about a row the previous snapshot had never seen", () => {
    // Two cases at once: the very first run, and a connection newly added to
    // the registry. Neither is news, and both would otherwise fire a wall of
    // alerts at whatever hour the deploy happened.
    expect(diffSnapshots([], [row("health-cron", "unconfigured")]).broke).toEqual([]);
    expect(
      diffSnapshots([row("ghl", "live")], [row("ghl", "live"), row("brand-new", "down")]).broke,
    ).toEqual([]);
  });

  it("ignores a row that disappeared from the current snapshot", () => {
    // A connection removed from the registry has not broken, it has retired.
    const { broke, recovered } = diffSnapshots([row("retired", "live")], []);
    expect(broke).toEqual([]);
    expect(recovered).toEqual([]);
  });

  it("does not alert on unverified, which is an unknown rather than a fault", () => {
    // A probe we cannot run says nothing about whether the credential works.
    // Paging on it would mean paging on our own lack of a probe.
    expect(diffSnapshots([row("resend", "live")], [row("resend", "unverified")]).broke).toEqual([]);
    expect(
      diffSnapshots([row("resend", "unverified")], [row("resend", "live")]).recovered,
    ).toEqual([]);
  });

  it("still catches a break that arrives from unverified", () => {
    const { broke } = diffSnapshots([row("app-auth", "unverified")], [row("app-auth", "down")]);
    expect(broke.map((r) => r.connectionId)).toEqual(["app-auth"]);
  });

  it("carries the current detail on a break, so the alert can say why", () => {
    const before = [row("meta-ads", "live")];
    const after: HealthSnapshotRow[] = [
      { connectionId: "meta-ads", label: "Meta Ads", state: "down", detail: "Meta returned 400" },
    ];
    expect(diffSnapshots(before, after).broke[0].detail).toBe("Meta returned 400");
  });

  it("handles several rows flipping in opposite directions at once", () => {
    const before = [row("a", "live"), row("b", "down"), row("c", "live"), row("d", "down")];
    const after = [row("a", "down"), row("b", "live"), row("c", "live"), row("d", "down")];
    const { broke, recovered } = diffSnapshots(before, after);
    expect(broke.map((r) => r.connectionId)).toEqual(["a"]);
    expect(recovered.map((r) => r.connectionId)).toEqual(["b"]);
  });
});

describe("snapshotFrom", () => {
  const response: HealthResponse = {
    environment: "production",
    checkedAt: "2026-07-27T12:00:00.000Z",
    connections: [
      {
        id: "meta-ads",
        configured: true,
        missing: [],
        credentials: [],
        probe: { state: "failed", detail: "Meta returned 400" },
      },
      {
        id: "supabase",
        configured: true,
        missing: [],
        credentials: [],
        probe: { state: "ok", detail: "Query returned" },
      },
    ],
    clients: [
      {
        tenantId: "t1",
        name: "Willis Windows",
        slug: "willis-windows",
        set: { ghl: true, "meta-ads": false },
        ghlProbe: { state: "failed", detail: "Returned 401" },
      },
    ],
  };

  it("flattens agency connections into comparable rows", () => {
    const rows = snapshotFrom(response);
    const meta = rows.find((r) => r.connectionId === "meta-ads");
    expect(meta?.state).toBe("down");
    expect(meta?.detail).toBe("Meta returned 400");
    expect(rows.find((r) => r.connectionId === "supabase")?.state).toBe("live");
  });

  it("gives each client's own credential its own row", () => {
    // A single client's dead token must be its own flip. Folding it into the
    // agency GHL row would mean one client breaking either hides behind the
    // others or drags them all red.
    const rows = snapshotFrom(response);
    const willis = rows.find((r) => r.connectionId === "client:willis-windows:ghl");
    expect(willis?.state).toBe("down");
    expect(willis?.label).toContain("Willis Windows");
  });

  it("labels every row with something a human recognises", () => {
    // The alert reads this, so a row labelled with a bare id would produce
    // exactly the "what is meta-ads" alert this whole feature exists to avoid.
    for (const r of snapshotFrom(response)) {
      expect(r.label.length, `${r.connectionId} needs a label`).toBeGreaterThan(2);
      expect(r.label).not.toBe(r.connectionId);
    }
  });

  it("does not emit rows for client credentials that were never set", () => {
    // "Not running ads yet" is not a fault and must never become an alert.
    const rows = snapshotFrom(response);
    expect(rows.some((r) => r.connectionId === "client:willis-windows:meta-ads")).toBe(false);
  });
});
