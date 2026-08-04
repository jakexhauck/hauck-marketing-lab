import { describe, it, expect, vi, afterEach } from "vitest";
import {
  composioConfigured,
  linkAccount,
  listConnectedAccounts,
  deleteConnectedAccount,
  executeTool,
  proxyCall,
} from "./composio";

const env = {
  COMPOSIO_API_KEY: "sk_test",
  COMPOSIO_GCAL_AUTH_CONFIG_ID: "ac_test",
} as never;

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("composioConfigured", () => {
  it("is false when nothing is set", () => {
    expect(composioConfigured({} as never)).toBe(false);
  });

  it("is false when only the key is set", () => {
    expect(composioConfigured({ COMPOSIO_API_KEY: "sk" } as never)).toBe(false);
  });

  it("is true when both are set", () => {
    expect(composioConfigured(env)).toBe(true);
  });
});

describe("linkAccount", () => {
  it("posts to the link endpoint and returns the redirect url", async () => {
    const f = fakeFetch(200, {
      redirect_url: "https://connect.composio.dev/link/lk_1",
      connected_account_id: "ca_1",
    });
    vi.stubGlobal("fetch", f);

    const out = await linkAccount(env, {
      userId: "tenant-1",
      callbackUrl: "https://app.example.com/sales/jobs",
    });

    expect(out).toEqual({
      redirectUrl: "https://connect.composio.dev/link/lk_1",
      connectedAccountId: "ca_1",
    });

    const [url, init] = f.mock.calls[0];
    // Singular /connected_accounts returns 400 for managed OAuth2 since
    // 2026-07-03. The /link path is the supported one.
    expect(url).toBe("https://backend.composio.dev/api/v3/connected_accounts/link");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk_test");
    expect(JSON.parse(init.body as string)).toEqual({
      auth_config_id: "ac_test",
      user_id: "tenant-1",
      callback_url: "https://app.example.com/sales/jobs",
    });
  });

  it("throws with the response body when Composio rejects", async () => {
    vi.stubGlobal("fetch", fakeFetch(422, { error: { message: "bad config" } }));
    await expect(
      linkAccount(env, { userId: "t", callbackUrl: "https://x" }),
    ).rejects.toThrow(/422/);
  });
});

describe("listConnectedAccounts", () => {
  it("filters by the plural array params", async () => {
    const f = fakeFetch(200, { items: [{ id: "ca_1", status: "ACTIVE" }] });
    vi.stubGlobal("fetch", f);

    const out = await listConnectedAccounts(env, "tenant-1");

    expect(out).toEqual([{ id: "ca_1", status: "ACTIVE" }]);
    expect(f.mock.calls[0][0]).toContain("user_ids=tenant-1");
    expect(f.mock.calls[0][0]).toContain("auth_config_ids=ac_test");
  });

  it("returns an empty array when Composio omits items", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, {}));
    expect(await listConnectedAccounts(env, "tenant-1")).toEqual([]);
  });
});

describe("deleteConnectedAccount", () => {
  it("revokes the upstream grant, not just the local record", async () => {
    const f = fakeFetch(200, { success: true });
    vi.stubGlobal("fetch", f);

    await deleteConnectedAccount(env, "ca_1");

    const [url, init] = f.mock.calls[0];
    expect(url).toContain("/connected_accounts/ca_1");
    expect(url).toContain("revoke_on_delete=true");
    expect(init.method).toBe("DELETE");
  });
});

describe("executeTool", () => {
  it("unwraps the data envelope", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: { ok: 1 }, error: null, successful: true }));
    await expect(executeTool(env, "SOME_TOOL", "tenant-1", { a: 1 })).resolves.toEqual({ ok: 1 });
  });

  it("throws when successful is false even though HTTP is 200", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: null, error: "nope", successful: false }));
    await expect(executeTool(env, "SOME_TOOL", "tenant-1", {})).rejects.toThrow(/nope/);
  });

  it("sends the user id and arguments", async () => {
    const f = fakeFetch(200, { data: {}, error: null, successful: true });
    vi.stubGlobal("fetch", f);

    await executeTool(env, "GOOGLECALENDAR_FIND_FREE_SLOTS", "tenant-1", { items: ["primary"] });

    expect(f.mock.calls[0][0]).toContain("/tools/execute/GOOGLECALENDAR_FIND_FREE_SLOTS");
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({
      user_id: "tenant-1",
      arguments: { items: ["primary"] },
    });
  });
});

// The proxy endpoint does NOT answer in the same shape as /tools/execute/<slug>.
// It returns { data, status, headers } and no `successful` field at all, so the
// upstream HTTP status is the only signal of success. Requiring `successful`
// here rejects every call that worked, silently, which is what mirrorAppointment
// had been doing since July.
describe("proxyCall", () => {
  it("passes a raw provider request through with the connected account", async () => {
    const f = fakeFetch(200, { data: { id: "ev_1" }, status: 200, headers: {} });
    vi.stubGlobal("fetch", f);

    const out = await proxyCall(env, {
      connectedAccountId: "ca_1",
      endpoint: "/calendars/primary/events",
      method: "POST",
      body: { summary: "Job" },
    });

    expect(out).toEqual({ id: "ev_1" });
    expect(f.mock.calls[0][0]).toContain("/tools/execute/proxy");
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({
      connected_account_id: "ca_1",
      endpoint: "/calendars/primary/events",
      method: "POST",
      body: { summary: "Job" },
    });
  });

  it("accepts a 201, which is what creating an event actually returns", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: { id: "ev_2" }, status: 201, headers: {} }));
    await expect(
      proxyCall(env, { connectedAccountId: "ca_1", endpoint: "/x", method: "POST" }),
    ).resolves.toEqual({ id: "ev_2" });
  });

  it("succeeds when the envelope omits status entirely", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: { id: "ev_3" } }));
    await expect(
      proxyCall(env, { connectedAccountId: "ca_1", endpoint: "/x", method: "GET" }),
    ).resolves.toEqual({ id: "ev_3" });
  });

  it("throws when the upstream provider rejects, though HTTP is still 200", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: { error: "forbidden" }, status: 403 }));
    await expect(
      proxyCall(env, { connectedAccountId: "ca_1", endpoint: "/x", method: "GET" }),
    ).rejects.toThrow(/403/);
  });

  it("still honours successful:false if Composio ever sends it", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: null, error: "denied", successful: false }));
    await expect(
      proxyCall(env, { connectedAccountId: "ca_1", endpoint: "/x", method: "GET" }),
    ).rejects.toThrow(/denied/);
  });
});
