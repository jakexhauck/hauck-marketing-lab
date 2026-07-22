import { describe, it, expect, vi, beforeEach } from "vitest";
import { ghlJson } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { onRequestGet, shapeSetterPipeline } from "./pipelines";
import type { Env, ApiData } from "../../../lib/env";

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
    request: new Request(`https://x.test/api/admin/setter/pipelines${query}`),
    env: {} as Env,
    data: { admin: { id: "admin-1" } } as unknown as ApiData,
  } as unknown as Parameters<typeof onRequestGet>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhlContextForTenant).mockResolvedValue(GCTX);
});

describe("shapeSetterPipeline", () => {
  it("sorts stages by live position, not array order", () => {
    const p = shapeSetterPipeline({
      id: "p1",
      name: "Lead Form Pipeline",
      stages: [
        { id: "s2", name: "Second", position: 1 },
        { id: "s1", name: "First", position: 0 },
      ],
    });
    expect(p.stages.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("flags a stage as needsDialing on a case-insensitive match anywhere in the name", () => {
    const p = shapeSetterPipeline({
      id: "p1",
      name: "Funnel Pipeline",
      stages: [
        { id: "s1", name: "Survey Completed No Call Booked (needs dialing)", position: 0 },
        { id: "s2", name: "NEEDS DIALING", position: 1 },
        { id: "s3", name: "Survey Follow Up", position: 2 },
      ],
    });
    expect(p.stages.find((s) => s.id === "s1")!.needsDialing).toBe(true);
    expect(p.stages.find((s) => s.id === "s2")!.needsDialing).toBe(true);
    expect(p.stages.find((s) => s.id === "s3")!.needsDialing).toBe(false);
  });

  it("carries the live stage color through unchanged", () => {
    const p = shapeSetterPipeline({
      id: "p1",
      name: "Customers Pipeline",
      stages: [{ id: "s1", name: "Recurring Customer", position: 0, color: "#16A34A" }],
    });
    expect(p.stages[0].color).toBe("#16A34A");
  });

  it("handles a pipeline with no stages at all", () => {
    const p = shapeSetterPipeline({ id: "p1", name: "Empty", stages: [] });
    expect(p.stages).toEqual([]);
  });

  it("handles a pipeline where stages is undefined", () => {
    const p = shapeSetterPipeline({ id: "p1", name: "Empty" } as { id: string; name: string });
    expect(p.stages).toEqual([]);
  });
});

// The route carries locationId to the browser so the cockpit can link a lead
// to its CRM contact record, which is how a setter dials from the client's
// business number (src/lib/setterModel.ts:ghlContactUrl). It rides this
// response rather than a new endpoint because the GHL context is already
// resolved here, once per client selection.
describe("GET /api/admin/setter/pipelines", () => {
  it("returns the tenant's own locationId alongside the pipelines", async () => {
    vi.mocked(ghlJson).mockResolvedValue({ pipelines: [] });
    const res = await onRequestGet(req("?tenantId=t1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ pipelines: [], locationId: "loc_tenant_own" });
  });

  // The suite's core security property (functions/lib/tenantGhl.ts): a setter
  // must never be handed another client's location, so assert the response
  // echoes what the tenant helper resolved rather than anything ambient.
  it("echoes the resolved location, never an env fallback", async () => {
    vi.mocked(getGhlContextForTenant).mockResolvedValue({
      token: "tok_other",
      locationId: "loc_second_client",
      slug: "second-client",
      mode: "live",
    });
    vi.mocked(ghlJson).mockResolvedValue({ pipelines: [] });
    const res = await onRequestGet(req("?tenantId=t2"));
    const body = (await res.json()) as { locationId: string };
    expect(body.locationId).toBe("loc_second_client");
  });

  it("400s missing_tenant_id and never resolves creds", async () => {
    const res = await onRequestGet(req(""));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_tenant_id" });
    expect(getGhlContextForTenant).not.toHaveBeenCalled();
  });

  it("propagates a placeholder-creds rejection without leaking a locationId", async () => {
    vi.mocked(getGhlContextForTenant).mockRejectedValue(
      new TenantGhlError(400, "ghl_not_connected", "Connect this client first."),
    );
    const res = await onRequestGet(req("?tenantId=t1"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "ghl_not_connected" });
    expect(ghlJson).not.toHaveBeenCalled();
  });
});
