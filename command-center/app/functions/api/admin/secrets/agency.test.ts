import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/supabase", () => ({ getServiceClient: () => null }));
vi.mock("../../../lib/adminAuth", () => ({ logAdminAction: () => Promise.resolve(true) }));
vi.mock("../../../lib/doppler", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/doppler")>("../../../lib/doppler");
  return {
    ...actual,
    fetchDopplerSecrets: () => (dopplerFails ? Promise.reject(new Error("Doppler returned 401")) : Promise.resolve(dopplerSecrets)),
    writeDopplerSecrets: (_e: unknown, s: Record<string, string>) => {
      written.push(s);
      return Promise.resolve();
    },
  };
});

import { onRequestGet, onRequestPut } from "./agency";
import type { AgencySecretRow } from "../../../../src/lib/secretsApi";

let dopplerSecrets: Record<string, string> = {};
let dopplerFails = false;
let written: Record<string, string>[] = [];

beforeEach(() => {
  dopplerSecrets = {};
  dopplerFails = false;
  written = [];
});

function get(env: Record<string, unknown>) {
  return onRequestGet({ env, request: new Request("http://x/api/admin/secrets/agency") } as never) as Promise<Response>;
}

function put(env: Record<string, unknown>, body: unknown) {
  return onRequestPut({
    env,
    data: { admin: { id: "A1" } },
    request: new Request("http://x", { method: "PUT", body: JSON.stringify(body) }),
  } as never) as Promise<Response>;
}

const READ_ENV = { DOPPLER_TOKEN: "dp.read" };

function row(rows: AgencySecretRow[], name: string): AgencySecretRow {
  const found = rows.find((r) => r.name === name);
  if (!found) throw new Error(`no row for ${name}`);
  return found;
}

describe("agency secrets: drift", () => {
  it("flags when Doppler and the running deploy disagree", async () => {
    dopplerSecrets = { META_SYSTEM_USER_TOKEN: "NEW-token-value" };
    const res = await get({ ...READ_ENV, META_SYSTEM_USER_TOKEN: "OLD-token-value" });
    const { rows } = (await res.json()) as { rows: AgencySecretRow[] };
    const meta = row(rows, "META_SYSTEM_USER_TOKEN");
    expect(meta.inDoppler).toBe(true);
    expect(meta.inRuntime).toBe(true);
    expect(meta.drift).toBe(true);
  });

  it("reports no drift when both sides match", async () => {
    dopplerSecrets = { META_SYSTEM_USER_TOKEN: "same" };
    const res = await get({ ...READ_ENV, META_SYSTEM_USER_TOKEN: "same" });
    const { rows } = (await res.json()) as { rows: AgencySecretRow[] };
    expect(row(rows, "META_SYSTEM_USER_TOKEN").drift).toBe(false);
  });

  it("says 'cannot tell' rather than 'fine' when only one side has a value", async () => {
    // The distinction that keeps the page honest: an unknown is not a pass.
    dopplerSecrets = { META_SYSTEM_USER_TOKEN: "only-in-doppler" };
    const res = await get(READ_ENV);
    const { rows } = (await res.json()) as { rows: AgencySecretRow[] };
    const meta = row(rows, "META_SYSTEM_USER_TOKEN");
    expect(meta.drift).toBeNull();
    expect(meta.inRuntime).toBe(false);
  });
});

describe("agency secrets: leakage", () => {
  it("never returns a raw value, only a masked tail", async () => {
    dopplerSecrets = { META_SYSTEM_USER_TOKEN: "SUPERSECRETVALUE1234" };
    const res = await get({ ...READ_ENV, META_SYSTEM_USER_TOKEN: "RUNTIMESECRET9876" });
    const text = await res.text();
    expect(text).not.toContain("SUPERSECRETVALUE");
    expect(text).not.toContain("RUNTIMESECRET");
    expect(text).toContain("••••1234");
  });

  it("does not cache the response", async () => {
    const res = await get(READ_ENV);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("agency secrets: read failures and extras", () => {
  it("still returns the full key list when Doppler is unreachable", async () => {
    dopplerFails = true;
    const res = await get(READ_ENV);
    const body = (await res.json()) as { readError: string; rows: AgencySecretRow[] };
    expect(body.readError).toContain("401");
    expect(body.rows.length).toBeGreaterThan(10);
    // Without Doppler we can still say what the running app has.
    expect(row(body.rows, "META_SYSTEM_USER_TOKEN").inDoppler).toBe(false);
  });

  it("lists Doppler keys no integration claims", async () => {
    dopplerSecrets = { RETIRED_FEATURE_KEY: "x", META_SYSTEM_USER_TOKEN: "y" };
    const res = await get(READ_ENV);
    const { unclaimed } = (await res.json()) as { unclaimed: string[] };
    expect(unclaimed).toContain("RETIRED_FEATURE_KEY");
    expect(unclaimed).not.toContain("META_SYSTEM_USER_TOKEN");
  });

  it("reports editing as off when there is no write token", async () => {
    const res = await get(READ_ENV);
    const { canEdit, canRead } = (await res.json()) as { canEdit: boolean; canRead: boolean };
    expect(canRead).toBe(true);
    expect(canEdit).toBe(false);
  });
});

describe("agency secrets: writes", () => {
  const WRITE_ENV = { ...READ_ENV, DOPPLER_WRITE_TOKEN: "dp.write" };

  it("refuses to write at all without a write token", async () => {
    const res = await put(READ_ENV, { name: "META_SYSTEM_USER_TOKEN", value: "x" });
    expect(res.status).toBe(403);
    expect(written).toHaveLength(0);
  });

  it("writes a known key through to Doppler", async () => {
    const res = await put(WRITE_ENV, { name: "META_SYSTEM_USER_TOKEN", value: "brand-new-1234" });
    expect(res.status).toBe(200);
    expect(written).toEqual([{ META_SYSTEM_USER_TOKEN: "brand-new-1234" }]);
    const body = (await res.json()) as { masked: string; note: string };
    expect(body.masked).toBe("••••1234");
    // The response must admit the running app has not changed yet.
    expect(body.note).toMatch(/redeploy/i);
  });

  it("refuses a key the registry does not declare", async () => {
    // Otherwise this is a general-purpose write into the agency secret store,
    // reachable from any admin session.
    const res = await put(WRITE_ENV, { name: "SOME_OTHER_APP_KEY", value: "x" });
    expect(res.status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("rejects a malformed body without touching Doppler", async () => {
    expect((await put(WRITE_ENV, { name: "META_SYSTEM_USER_TOKEN" })).status).toBe(400);
    expect((await put(WRITE_ENV, { value: "x" })).status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("allows an explicit clear", async () => {
    const res = await put(WRITE_ENV, { name: "GITHUB_REPO", value: "" });
    expect(res.status).toBe(200);
    expect(written).toEqual([{ GITHUB_REPO: "" }]);
  });
});
