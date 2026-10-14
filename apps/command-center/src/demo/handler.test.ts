import { beforeEach, describe, expect, it } from "vitest";
import { handleDemoRequest } from "./handler";
import { ApiError } from "../lib/api";
import * as store from "./store";
import type { ApiLead, ApiSummary, ApiTenant } from "../lib/api";

beforeEach(() => store.__resetStore());

describe("demo handler routing (reads)", () => {
  it("returns the tenant", async () => {
    const res = await handleDemoRequest<{ tenant: ApiTenant }>("/api/tenant");
    expect(res.tenant.name).toBe("Coastal Roofing Co");
  });

  it("returns all leads, and filters by pipelineId", async () => {
    const all = await handleDemoRequest<{ leads: ApiLead[]; total: number }>(
      "/api/leads",
    );
    expect(all.total).toBe(all.leads.length);
    expect(all.leads.length).toBeGreaterThan(0);

    const pid = all.leads[0].pipelineId;
    const filtered = await handleDemoRequest<{ leads: ApiLead[] }>(
      `/api/leads?pipelineId=${pid}`,
    );
    expect(filtered.leads.every((l) => l.pipelineId === pid)).toBe(true);
  });

  it("returns a computed summary", async () => {
    const s = await handleDemoRequest<ApiSummary>("/api/summary");
    expect(s.pipelines.length).toBeGreaterThan(0);
    expect(typeof s.newToday).toBe("number");
  });
});

describe("demo handler routing (writes stick)", () => {
  it("PATCH /api/leads/:id mutates and the next GET reflects it", async () => {
    const { leads } = await handleDemoRequest<{ leads: ApiLead[] }>("/api/leads");
    const target = leads.find((l) => l.status === "open")!;

    await handleDemoRequest(`/api/leads/${target.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "won", value: 12000 }),
    });

    const after = await handleDemoRequest<{ lead: ApiLead }>(
      `/api/leads/${target.id}`,
    );
    expect(after.lead.status).toBe("won");
    expect(after.lead.value).toBe(12000);
  });

  it("POSTing a message appends to the lead's thread", async () => {
    const { leads } = await handleDemoRequest<{ leads: ApiLead[] }>("/api/leads");
    const withThread = leads.find(
      (l) => (store.getStore().messages[l.contactId] ?? []).length > 0,
    )!;
    const before = store.getStore().messages[withThread.contactId].length;

    await handleDemoRequest(`/api/leads/${withThread.id}/sms`, {
      method: "POST",
      body: JSON.stringify({ body: "On my way." }),
    });

    expect(store.getStore().messages[withThread.contactId].length).toBe(before + 1);
  });
});

describe("demo handler unknown routes", () => {
  it("throws a 404 ApiError", async () => {
    await expect(handleDemoRequest("/api/does-not-exist")).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
