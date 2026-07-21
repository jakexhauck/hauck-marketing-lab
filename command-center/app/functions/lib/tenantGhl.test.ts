import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServiceClient } from "./supabase";
import { getGhlContextForTenant, isPlaceholder, TenantGhlError } from "./tenantGhl";
import type { Env } from "./env";

// Mock the transport wholesale, same seam as functions/lib/googleCalendar.test.ts:
// getGhlContextForTenant is the ONLY thing standing between an admin write and
// resolveGhlCreds's env-var fallback (see this file's own header comment), so
// these tests stub Supabase directly rather than hitting a real database.
vi.mock("./supabase", () => ({
  getServiceClient: vi.fn(),
}));

// Sentinel values that are obviously wrong for a real tenant: if any
// assertion below ever sees these strings in a returned GhlContext, that
// proves the function read the env fallback instead of the tenant row.
const ENV_SENTINEL_LOCATION = "ENV-SENTINEL-LOCATION-DO-NOT-USE";
const ENV_SENTINEL_TOKEN = "ENV-SENTINEL-TOKEN-DO-NOT-USE";

function envWithSentinels(): Env {
  return {
    GHL_LOCATION_ID: ENV_SENTINEL_LOCATION,
    GHL_TOKEN: ENV_SENTINEL_TOKEN,
  } as unknown as Env;
}

// Stubs the one call chain getGhlContextForTenant makes:
// client.from("tenants").select(...).eq("id", tenantId).maybeSingle().
function stubClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as ReturnType<typeof getServiceClient>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isPlaceholder", () => {
  it("rejects the three known placeholder values", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("pending")).toBe(true);
    expect(isPlaceholder("env")).toBe(true);
  });
  it("accepts a real value", () => {
    expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
  });
  it("treats null and undefined as placeholder", () => {
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });
});

describe("getGhlContextForTenant", () => {
  const REAL_LOCATION = "loc_r0WfsA12qpBv7M185V3v";
  const REAL_TOKEN = "tok_9f8e7d6c5b4a39281706";

  it.each(["", "pending", "env"])(
    "throws ghl_not_connected when both fields hold the placeholder %j",
    async (placeholder) => {
      vi.mocked(getServiceClient).mockReturnValue(
        stubClient({
          data: { ghl_location_id: placeholder, ghl_token: placeholder },
          error: null,
        }),
      );
      await expect(getGhlContextForTenant(envWithSentinels(), "tenant-1")).rejects.toMatchObject({
        code: "ghl_not_connected",
        status: 400,
      });
    },
  );

  it.each(["", "pending", "env"])(
    "throws ghl_not_connected when only ghl_location_id is the placeholder %j",
    async (placeholder) => {
      vi.mocked(getServiceClient).mockReturnValue(
        stubClient({
          data: { ghl_location_id: placeholder, ghl_token: REAL_TOKEN },
          error: null,
        }),
      );
      const err = await getGhlContextForTenant(envWithSentinels(), "tenant-1").catch((e) => e);
      expect(err).toBeInstanceOf(TenantGhlError);
      expect(err).toMatchObject({ code: "ghl_not_connected" });
    },
  );

  it.each(["", "pending", "env"])(
    "throws ghl_not_connected when only ghl_token is the placeholder %j",
    async (placeholder) => {
      vi.mocked(getServiceClient).mockReturnValue(
        stubClient({
          data: { ghl_location_id: REAL_LOCATION, ghl_token: placeholder },
          error: null,
        }),
      );
      await expect(getGhlContextForTenant(envWithSentinels(), "tenant-1")).rejects.toMatchObject({
        code: "ghl_not_connected",
      });
    },
  );

  it("throws tenant_not_found when there is no row for the id", async () => {
    vi.mocked(getServiceClient).mockReturnValue(stubClient({ data: null, error: null }));
    await expect(getGhlContextForTenant(envWithSentinels(), "no-such-tenant")).rejects.toMatchObject({
      code: "tenant_not_found",
      status: 404,
    });
  });

  it("returns the tenant's own real credentials", async () => {
    vi.mocked(getServiceClient).mockReturnValue(
      stubClient({
        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN, slug: "willis-windows" },
        error: null,
      }),
    );
    const ctx = await getGhlContextForTenant(envWithSentinels(), "tenant-1");
    expect(ctx).toEqual({
      locationId: REAL_LOCATION,
      token: REAL_TOKEN,
      slug: "willis-windows",
      mode: "live",
    });
  });

  it("derives mode test for the seeded test-account tenant", async () => {
    vi.mocked(getServiceClient).mockReturnValue(
      stubClient({
        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN, slug: "test-account" },
        error: null,
      }),
    );
    const ctx = await getGhlContextForTenant(envWithSentinels(), "t-test");
    expect(ctx.slug).toBe("test-account");
    expect(ctx.mode).toBe("test");
  });

  it("derives mode live for any other tenant", async () => {
    vi.mocked(getServiceClient).mockReturnValue(
      stubClient({
        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN, slug: "willis-windows" },
        error: null,
      }),
    );
    const ctx = await getGhlContextForTenant(envWithSentinels(), "t-willis");
    expect(ctx.slug).toBe("willis-windows");
    expect(ctx.mode).toBe("live");
  });

  it("honours TEST_TENANT_SLUG when the env overrides the default", async () => {
    // testTenantSlug(env) is env.TEST_TENANT_SLUG || "test-account", so the
    // derivation has to read the env, not hardcode the default slug.
    vi.mocked(getServiceClient).mockReturnValue(
      stubClient({
        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN, slug: "sandbox-two" },
        error: null,
      }),
    );
    const env = { ...envWithSentinels(), TEST_TENANT_SLUG: "sandbox-two" } as unknown as Env;
    const ctx = await getGhlContextForTenant(env, "t-sandbox");
    expect(ctx.mode).toBe("test");
  });

  it("treats a missing slug as an empty string rather than undefined", async () => {
    // slug is NOT NULL in migration 0001, but a row read through a stubbed or
    // partially selected client should still produce a usable string.
    vi.mocked(getServiceClient).mockReturnValue(
      stubClient({
        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN },
        error: null,
      }),
    );
    const ctx = await getGhlContextForTenant(envWithSentinels(), "tenant-1");
    expect(ctx.slug).toBe("");
    expect(ctx.mode).toBe("live");
  });

  it("never reads env.GHL_LOCATION_ID or env.GHL_TOKEN, even as an env-var fallback", async () => {
    // This is the divergence from resolveGhlCreds (tenantResolve.ts) that
    // the header comment on getGhlContextForTenant calls out by name: that
    // helper falls back to these two env vars, which belong to a live
    // production client. This helper must throw instead, never fall back.
    // A real-creds row proves the sentinels never leak through on the
    // success path; the placeholder cases above already prove it throws
    // instead of falling back on the failure path.
    vi.mocked(getServiceClient).mockReturnValue(
      stubClient({
        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN },
        error: null,
      }),
    );
    const ctx = await getGhlContextForTenant(envWithSentinels(), "tenant-1");
    expect(ctx.locationId).not.toBe(ENV_SENTINEL_LOCATION);
    expect(ctx.token).not.toBe(ENV_SENTINEL_TOKEN);
    expect(JSON.stringify(ctx)).not.toContain("SENTINEL");
  });

  it("throws tenant_lookup_failed on a Supabase error, never falling through to env creds", async () => {
    vi.mocked(getServiceClient).mockReturnValue(
      stubClient({ data: null, error: { message: "connection reset" } }),
    );
    await expect(getGhlContextForTenant(envWithSentinels(), "tenant-1")).rejects.toMatchObject({
      code: "tenant_lookup_failed",
      status: 500,
    });
  });
});
