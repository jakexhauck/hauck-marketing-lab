import { describe, it, expect, vi, beforeEach } from "vitest";
import { ghlJson } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { onRequestGet, shapeSetterCalendar } from "./calendars";
import type { Env, ApiData } from "../../../lib/env";

// This route is a thin shell over listCalendars, so the interesting behaviour
// is all at the seams: which creds helper it uses, what it filters, and how a
// CRM failure is reported. The GHL transport is mocked one level BELOW
// listCalendars (ghlJson, not the appointments module) so the active-only
// filter actually executes under test instead of being stubbed out.
vi.mock("../../../lib/ghl", () => ({ ghlJson: vi.fn() }));
vi.mock("../../../lib/tenantGhl", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/tenantGhl")>(
    "../../../lib/tenantGhl",
  );
  return { ...actual, getGhlContextForTenant: vi.fn() };
});

const GCTX = { token: "tok_tenant_own", locationId: "loc_tenant_own", slug: "test-client", mode: "live" as const };

function req(query: string): Parameters<typeof onRequestGet>[0] {
  return {
    request: new Request(`https://x.test/api/admin/setter/calendars${query}`),
    env: {} as Env,
    data: { admin: { id: "admin-1" } } as unknown as ApiData,
  } as unknown as Parameters<typeof onRequestGet>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhlContextForTenant).mockResolvedValue(GCTX);
});

describe("shapeSetterCalendar", () => {
  it("normalizes a missing name to an empty string", () => {
    expect(shapeSetterCalendar({ id: "c1" })).toEqual({ id: "c1", name: "", isActive: true });
  });

  it("treats an absent isActive as active, matching the GHL wire shape", () => {
    expect(shapeSetterCalendar({ id: "c1", name: "Home Estimate" }).isActive).toBe(true);
  });

  it("carries an explicit isActive:false through", () => {
    expect(shapeSetterCalendar({ id: "c1", name: "Retired", isActive: false }).isActive).toBe(false);
  });
});

describe("GET /api/admin/setter/calendars", () => {
  it("400s missing_tenant_id when tenantId is absent", async () => {
    const res = await onRequestGet(req(""));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_tenant_id" });
    expect(getGhlContextForTenant).not.toHaveBeenCalled();
  });

  it("400s missing_tenant_id when tenantId is blank", async () => {
    const res = await onRequestGet(req("?tenantId=%20%20"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_tenant_id" });
  });

  it("resolves creds through getGhlContextForTenant with the trimmed tenantId", async () => {
    vi.mocked(ghlJson).mockResolvedValue({ calendars: [] });
    await onRequestGet(req("?tenantId=%20t1%20"));
    expect(getGhlContextForTenant).toHaveBeenCalledWith({}, "t1");
  });

  it("returns only active calendars, in {id,name,isActive} shape", async () => {
    vi.mocked(ghlJson).mockResolvedValue({
      calendars: [
        { id: "c1", name: "Home Estimate", isActive: true },
        { id: "c2", name: "Retired Calendar", isActive: false },
        { id: "c3", name: "No Flag At All" },
      ],
    });
    const res = await onRequestGet(req("?tenantId=t1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      calendars: [
        { id: "c1", name: "Home Estimate", isActive: true },
        { id: "c3", name: "No Flag At All", isActive: true },
      ],
    });
  });

  it("asks the CRM for the tenant's own location, never an env one", async () => {
    vi.mocked(ghlJson).mockResolvedValue({ calendars: [] });
    await onRequestGet(req("?tenantId=t1"));
    const [passedCtx, path] = vi.mocked(ghlJson).mock.calls[0];
    expect(passedCtx).toEqual(GCTX);
    expect(path).toContain("locationId=loc_tenant_own");
  });

  it("returns an empty list when the location has no calendars", async () => {
    vi.mocked(ghlJson).mockResolvedValue({});
    const res = await onRequestGet(req("?tenantId=t1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ calendars: [] });
  });

  it("propagates a placeholder-creds rejection and never calls the CRM", async () => {
    vi.mocked(getGhlContextForTenant).mockRejectedValue(
      new TenantGhlError(400, "ghl_not_connected", "Connect this client first."),
    );
    const res = await onRequestGet(req("?tenantId=t1"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "ghl_not_connected" });
    expect(ghlJson).not.toHaveBeenCalled();
  });

  it("propagates tenant_not_found with its own 404 status", async () => {
    vi.mocked(getGhlContextForTenant).mockRejectedValue(
      new TenantGhlError(404, "tenant_not_found", "No such client."),
    );
    const res = await onRequestGet(req("?tenantId=nope"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "tenant_not_found" });
  });

  it("502s ghl_unavailable when the calendars call fails", async () => {
    vi.mocked(ghlJson).mockRejectedValue(new Error("GHL GET /calendars/ returned 500: boom"));
    const res = await onRequestGet(req("?tenantId=t1"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "ghl_unavailable" });
  });
});
