import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolvePaidAdsPipeline,
  fetchPaidAdsLeads,
  PAID_PIPELINE_FALLBACK_ID,
  type PipelinesResponse,
} from "./paidAdsPipeline";
import type { GhlContext } from "./ghl";

// Pins the exact by-name pipeline resolution + fetch/shape/sort behavior
// extracted out of functions/api/ads/leads/index.ts into this pure core, so a
// future admin endpoint can call the same logic for an admin-chosen tenant.
// Behavior-preserving: locks the CURRENT output (name/contains/fallback/null
// resolution, pipeline_not_found, fetch + newest-first sort).

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonRes(data: unknown) {
  return { ok: true, json: async () => data };
}

describe("resolvePaidAdsPipeline", () => {
  const pipes: PipelinesResponse["pipelines"] = [
    { id: "p1", name: "Sales Pipeline", stages: [{ id: "s1", name: "Job Completed" }] },
    { id: "p2", name: "Paid Ad's Pipeline", stages: [{ id: "s2", name: "New Lead" }, { id: "s3", name: "Booked" }] },
  ];

  it("resolves the exact name match (case/whitespace-insensitive)", () => {
    const result = resolvePaidAdsPipeline(pipes);
    expect(result?.pipelineId).toBe("p2");
    expect(result?.stageNames.get("s2")).toBe("New Lead");
    expect(result?.stageNames.get("s3")).toBe("Booked");
  });

  it("falls back to a looser 'contains' match on a renamed pipeline", () => {
    const renamed: PipelinesResponse["pipelines"] = [
      { id: "px", name: "2026 Paid Ads Funnel", stages: [{ id: "s1", name: "Lead In" }] },
    ];
    expect(resolvePaidAdsPipeline(renamed)?.pipelineId).toBe("px");
  });

  it("falls back to the hardcoded template id when no name matches", () => {
    const fallbackOnly: PipelinesResponse["pipelines"] = [
      { id: PAID_PIPELINE_FALLBACK_ID, name: "Unnamed Pipeline", stages: [] },
    ];
    expect(resolvePaidAdsPipeline(fallbackOnly)?.pipelineId).toBe(PAID_PIPELINE_FALLBACK_ID);
  });

  it("returns null when neither the name nor the fallback id is present", () => {
    const none: PipelinesResponse["pipelines"] = [
      { id: "other", name: "Onboarding Pipeline", stages: [] },
    ];
    expect(resolvePaidAdsPipeline(none)).toBeNull();
  });
});

describe("fetchPaidAdsLeads", () => {
  const gctx: GhlContext = { token: "tok", locationId: "loc-1" };

  it("returns pipeline_not_found (honest empty) when the tenant has no Paid Ad's Pipeline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonRes({ pipelines: [{ id: "other", name: "Onboarding", stages: [] }] })),
    );

    const result = await fetchPaidAdsLeads(gctx);

    expect(result).toEqual({ leads: [], total: 0, configError: "pipeline_not_found" });
  });

  it("fetches opportunities in the resolved pipeline, shapes them with stageName, and sorts newest-activity-first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/opportunities/pipelines") {
          return jsonRes({
            pipelines: [
              {
                id: "p2",
                name: "Paid Ad's Pipeline",
                stages: [{ id: "s2", name: "New Lead" }, { id: "s3", name: "Booked" }],
              },
            ],
          });
        }
        if (url.pathname === "/opportunities/search") {
          return jsonRes({
            opportunities: [
              {
                id: "o1",
                name: "Older Lead",
                contactId: "c1",
                pipelineId: "p2",
                pipelineStageId: "s2",
                lastStatusChangeAt: "2026-07-01T00:00:00Z",
              },
              {
                id: "o2",
                name: "Newer Lead",
                contactId: "c2",
                pipelineId: "p2",
                pipelineStageId: "s3",
                lastStatusChangeAt: "2026-07-05T00:00:00Z",
              },
            ],
          });
        }
        throw new Error("unexpected fetch: " + input);
      }),
    );

    const result = await fetchPaidAdsLeads(gctx);

    expect(result.total).toBe(2);
    expect(result.configError).toBeUndefined();
    expect(result.leads.map((l) => l.id)).toEqual(["o2", "o1"]); // newest first
    expect(result.leads[0].stageName).toBe("Booked");
    expect(result.leads[1].stageName).toBe("New Lead");
  });
});
