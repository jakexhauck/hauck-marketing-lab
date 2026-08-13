import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocked at the module boundary so the probes run for real against fakes: the
// thing worth proving is that one dead vendor cannot take down the whole
// response, which is exactly what a status page must never do.
vi.mock("../../../lib/supabase", () => ({ getServiceClient: (env: never) => fakeClient(env) }));
vi.mock("../../../lib/driveDirect", () => ({
  isConnected: () => Promise.resolve(driveState),
  getAccessToken: () => (driveTokenValid ? Promise.resolve("tok") : Promise.reject(new Error("invalid_grant"))),
  DriveNotConnectedError: class extends Error {},
}));

import { onRequestGet } from "./health";
import type { HealthResponse } from "../../../../src/lib/connectionHealth";

let driveState = { connected: false, email: null as string | null };
let driveTokenValid = true;
let tenantRows: Record<string, unknown>[] = [];
let supabaseUp = true;

function fakeClient(env: unknown) {
  const e = env as Record<string, unknown>;
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return null;
  return {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: (_cols?: unknown, opts?: { head?: boolean }) => {
          if (table === "push_subscriptions" && opts?.head) {
            return Promise.resolve({ count: 3, error: null });
          }
          return q;
        },
        limit: () =>
          Promise.resolve({ error: supabaseUp ? null : { message: "connection refused" } }),
        order: () => Promise.resolve({ data: tenantRows, error: null }),
      };
      return q;
    },
  };
}

function baseEnv(over: Record<string, unknown> = {}) {
  return {
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "svc",
    SUPABASE_ANON_KEY: "anon",
    ...over,
  } as never;
}

function call(env: unknown, url = "http://localhost:5173/api/admin/connections/health") {
  return onRequestGet({ env, request: new Request(url) } as never) as Promise<Response>;
}

async function body(res: Response): Promise<HealthResponse> {
  return (await res.json()) as HealthResponse;
}

function entry(json: HealthResponse, id: string) {
  const found = json.connections.find((c) => c.id === id);
  if (!found) throw new Error(`no entry for ${id}`);
  return found;
}

beforeEach(() => {
  driveState = { connected: false, email: null };
  driveTokenValid = true;
  tenantRows = [];
  supabaseUp = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connection health endpoint", () => {
  it("names the exact missing credential rather than just failing", async () => {
    const json = await body(await call(baseEnv()));
    const meta = entry(json, "meta-ads");
    expect(meta.configured).toBe(false);
    expect(meta.missing).toContain("META_SYSTEM_USER_TOKEN");
    // The optional single-tenant fallback must not be reported as missing.
    expect(meta.missing).not.toContain("META_AD_ACCOUNT_ID");
  });

  it("reports a reachable Supabase as ok and an unreachable one as failed", async () => {
    let json = await body(await call(baseEnv()));
    expect(entry(json, "supabase").probe.state).toBe("ok");

    supabaseUp = false;
    json = await body(await call(baseEnv()));
    expect(entry(json, "supabase").probe).toEqual({
      state: "failed",
      detail: "connection refused",
    });
  });

  it("marks Drive down when consent was never given, and ok once the grant spends", async () => {
    let json = await body(await call(baseEnv()));
    expect(entry(json, "google-drive").probe.state).toBe("failed");
    expect(entry(json, "google-drive").probe.detail).toMatch(/never consented/i);

    driveState = { connected: true, email: "contact.jakehauck@gmail.com" };
    json = await body(await call(baseEnv()));
    const probe = entry(json, "google-drive").probe;
    expect(probe.state).toBe("ok");
    expect(probe.detail).toContain("contact.jakehauck@gmail.com");
  });

  it("catches a revoked Drive grant that still has a stored token", async () => {
    // The failure mode a presence check alone would call healthy.
    driveState = { connected: true, email: "x@y.com" };
    driveTokenValid = false;
    const json = await body(await call(baseEnv()));
    expect(entry(json, "google-drive").probe.state).toBe("failed");
  });

  it("fails GA4 loudly when the service-account JSON is mangled", async () => {
    const json = await body(await call(baseEnv({ GA4_SA_JSON: "{not-json" })));
    expect(entry(json, "ga4").probe).toEqual({
      state: "failed",
      detail: "Service-account JSON does not parse",
    });
  });

  it("keeps every other row intact when one vendor throws", async () => {
    // A network-level failure, not an HTTP error: the harshest case.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("getaddrinfo ENOTFOUND"))),
    );
    const json = await body(await call(baseEnv({ GITHUB_TOKEN: "gh" })));
    expect(entry(json, "github").probe.state).toBe("failed");
    expect(entry(json, "github").probe.detail).toContain("ENOTFOUND");
    // The point: the response is still complete and Supabase still reports.
    expect(json.connections).toHaveLength(
      (await import("../../../../src/lib/connectionRegistry")).CONNECTIONS.length,
    );
    expect(entry(json, "supabase").probe.state).toBe("ok");
  });

  it("surfaces a fine-grained GitHub token's expiry date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("{}", {
            status: 200,
            headers: { "github-authentication-token-expiration": "2026-09-01 00:00:00 UTC" },
          }),
        ),
      ),
    );
    const json = await body(await call(baseEnv({ GITHUB_TOKEN: "gh" })));
    expect(entry(json, "github").probe.detail).toContain("2026-09-01");
  });

  it("explains a skipped probe instead of leaving it blank", async () => {
    const json = await body(await call(baseEnv({ APP_PASSWORD: "pw", SESSION_SECRET: "s" })));
    const auth = entry(json, "app-auth");
    expect(auth.configured).toBe(true);
    expect(auth.probe.state).toBe("skipped");
    expect(auth.probe.detail.length).toBeGreaterThan(10);
  });

  it("does not probe a client whose token is still a placeholder", async () => {
    tenantRows = [
      { id: "t1", slug: "test-account", name: "Made Better Landscaping Co", ghl_location_id: "pending", ghl_token: "pending" },
    ];
    const fetchSpy = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchSpy);
    const json = await body(await call(baseEnv()));
    expect(json.clients).toHaveLength(1);
    expect(json.clients[0].set.ghl).toBe(false);
    expect(json.clients[0].ghlProbe.state).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("probes a real client token and reports the rejection status", async () => {
    tenantRows = [
      {
        id: "t2",
        slug: "willis-windows",
        name: "Willis",
        ghl_location_id: "LOC1",
        ghl_token: "tok",
        meta_ad_account_id: "act_123",
        ga4_property_id: null,
        google_place_id: null,
      },
    ];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("nope", { status: 401 }))));
    const json = await body(await call(baseEnv()));
    const client = json.clients[0];
    expect(client.name).toBe("Willis");
    expect(client.set).toEqual({
      ghl: true,
      "meta-ads": true,
      ga4: false,
      "google-places": false,
    });
    expect(client.ghlProbe).toEqual({ state: "failed", detail: "Returned 401" });
  });

  it("flags a localhost run so a missing local secret is not read as a production fault", async () => {
    const local = await body(await call(baseEnv()));
    expect(local.environment).toBe("local");
    const prod = await body(
      await call(baseEnv(), "https://app.hauckmarketing.com/api/admin/connections/health"),
    );
    expect(prod.environment).toBe("production");
  });

  it("never caches: a stale health snapshot is the failure this page prevents", async () => {
    const res = await call(baseEnv());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
