import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAdsInsights, buildAds, derivePhase, type AdsContext } from "./adsCore";
import type { Env } from "./env";

// Pins the exact shaping/join behavior extracted out of
// functions/api/ads/insights.ts into this pure core, so a future admin
// endpoint can call the same logic with an explicitly-loaded tenant. This
// suite exercises buildAdsInsights end to end (stubbed Meta + GHL fetches):
// totals, the ad-level join, the platform split, the weekly bucketing, the
// phase badge, and the GHL revenue join. buildAds/derivePhase stay exported
// and covered directly too (ported from insights.test.ts's coverage).

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonRes(data: unknown) {
  return { ok: true, json: async () => data };
}

const CTX: AdsContext = {
  metaAccount: "act_123",
  ghlToken: "ghl-token",
  ghlLocationId: "loc-1",
  zone: "America/Chicago",
};

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    META_SYSTEM_USER_TOKEN: "meta-token",
    ...overrides,
  } as Env;
}

// Routes every stubbed fetch by host + query, mirroring the real Meta/GHL
// endpoints buildAdsInsights hits. One fixed, realistic dataset: $100 spend,
// 5 leads this month, one ad, one ad-won GHL customer worth $500.
function stubFetch() {
  const fetchMock = vi.fn().mockImplementation(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "graph.facebook.com") {
      const level = url.searchParams.get("level");
      const preset = url.searchParams.get("date_preset");
      const breakdowns = url.searchParams.get("breakdowns");
      const timeIncrement = url.searchParams.get("time_increment");

      if (url.pathname.endsWith("/adsets")) {
        return jsonRes({
          data: [{ effective_status: "ACTIVE", learning_stage_info: { status: "SUCCESS" } }],
        });
      }
      if (url.pathname.endsWith("/ads")) {
        return jsonRes({
          data: [
            {
              id: "ad1",
              name: "Ad One",
              effective_status: "ACTIVE",
              creative: { title: "Headline", body: "Copy", image_url: "https://img.example/ad1.jpg" },
              campaign: { name: "Summer Promo" },
              adset: { name: "Lookalike 1%" },
            },
          ],
        });
      }
      if (breakdowns === "publisher_platform") {
        return jsonRes({
          data: [
            { publisher_platform: "facebook", actions: [{ action_type: "lead", value: "3" }] },
            { publisher_platform: "instagram", actions: [{ action_type: "lead", value: "2" }] },
          ],
        });
      }
      if (level === "ad") {
        return jsonRes({
          data: [{ ad_id: "ad1", spend: "50", reach: "1000", actions: [{ action_type: "lead", value: "5" }] }],
        });
      }
      if (preset === "last_month") {
        return jsonRes({ data: [{ actions: [{ action_type: "lead", value: "4" }] }] });
      }
      if (timeIncrement === "1") {
        return jsonRes({
          data: [
            { date_start: "2026-07-01", actions: [{ action_type: "lead", value: "1" }] },
            { date_start: "2026-07-08", actions: [{ action_type: "lead", value: "2" }] },
          ],
        });
      }
      // account totals, this_month
      return jsonRes({
        data: [
          {
            spend: "100",
            impressions: "1000",
            clicks: "50",
            ctr: "5",
            cpc: "2",
            cpm: "10",
            reach: "800",
            frequency: "1.2",
            actions: [{ action_type: "lead", value: "5" }],
          },
        ],
      });
    }
    if (url.hostname === "services.leadconnectorhq.com") {
      if (url.pathname === "/opportunities/pipelines") {
        return jsonRes({
          pipelines: [{ id: "p1", name: "Sales Pipeline", stages: [{ id: "s1", name: "Job Completed" }] }],
        });
      }
      if (url.pathname === "/opportunities/search") {
        return jsonRes({
          opportunities: [
            {
              id: "o1",
              contactId: "c1",
              pipelineStageId: "s1",
              monetaryValue: 500,
              lastStatusChangeAt: new Date().toISOString(),
            },
          ],
        });
      }
      if (url.pathname === "/contacts/c1") {
        return jsonRes({ contact: { tags: ["facebook ads"] } });
      }
    }
    throw new Error("unexpected fetch: " + input);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("buildAdsInsights", () => {
  it("returns totals, the ad-level join, sources, phase and the GHL revenue join", async () => {
    stubFetch();

    const result = await buildAdsInsights(baseEnv(), CTX);

    expect(result.configured).toBe(true);
    expect(result.currency).toBe("USD");
    expect(result.totals).toEqual({
      spend: 100,
      leads: 5,
      costPerLead: 20,
      customers: 1,
      revenue: 500,
      roas: 5,
      impressions: 1000,
      reach: 800,
      frequency: 1.2,
      clicks: 50,
      ctr: 5,
      cpc: 2,
      cpm: 10,
    });
    expect(result.lastMonthLeads).toBe(4);
    expect(result.weekly).toEqual([
      { label: "Week 1", value: 1 },
      { label: "Week 2", value: 2 },
    ]);
    expect(result.sources).toEqual({ fb: 3, ig: 2 });
    expect(result.phase).toBe("scaling");
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0]).toMatchObject({
      id: "ad1",
      headline: "Headline",
      copy: "Copy",
      active: true,
      leads: 5,
      reach: 1000,
      spend: 50,
      thumbnailUrl: "https://img.example/ad1.jpg",
      campaignName: "Summer Promo",
      adsetName: "Lookalike 1%",
    });
  });

  it("skips the GHL revenue join (honest zeros) when ghlToken/ghlLocationId are empty", async () => {
    stubFetch();

    const result = await buildAdsInsights(baseEnv(), { ...CTX, ghlToken: "", ghlLocationId: "" });

    expect(result.totals.customers).toBe(0);
    expect(result.totals.revenue).toBe(0);
    expect(result.totals.roas).toBe(0);
    // Meta numbers still render even with no GHL context.
    expect(result.totals.spend).toBe(100);
  });

  it("caches the payload in KV under the ads:insights:v2 key and serves a cache hit without refetching Meta", async () => {
    const fetchMock = stubFetch();
    const store = new Map<string, string>();
    const kv = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    } as unknown as Env["KV_CACHE"];

    const env = baseEnv({ KV_CACHE: kv });
    const first = await buildAdsInsights(env, CTX);

    const monthKey = new Date().toISOString().slice(0, 7);
    const expectedKey = `ads:insights:v2:${CTX.metaAccount}:${CTX.ghlLocationId}:${monthKey}`;
    expect(store.has(expectedKey)).toBe(true);

    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await buildAdsInsights(env, CTX);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no new fetch: served from cache
    expect(second).toEqual(first);
  });

  it("degrades to an honest empty payload with an error message when a Meta call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad token" }));

    const result = await buildAdsInsights(baseEnv(), CTX);

    expect(result.configured).toBe(true);
    expect(result.totals).toEqual({
      spend: 0, leads: 0, costPerLead: 0, customers: 0, revenue: 0, roas: 0,
      impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
    });
    expect(result.ads).toEqual([]);
    expect(result.phase).toBeNull();
    expect(result.error).toMatch(/Meta 401/);
  });
});

// Ported straight from insights.test.ts's coverage: these two pure helpers now
// live in adsCore and must keep behaving identically.
describe("buildAds", () => {
  it("joins ad-level insights to ad metadata, sorts active-first then by leads", () => {
    const insights = [
      { ad_id: "a", spend: "10", reach: "100", actions: [{ action_type: "lead", value: "2" }] },
      { ad_id: "b", spend: "20", reach: "200", actions: [{ action_type: "lead", value: "9" }] },
    ];
    const meta = [
      { id: "a", name: "A", effective_status: "PAUSED", creative: {} },
      { id: "b", name: "B", effective_status: "ACTIVE", creative: {} },
    ];
    const ads = buildAds(insights, meta);
    expect(ads.map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("marks an image creative image/videoId-empty and reads its full image_url", () => {
    const meta = [
      {
        id: "img",
        name: "Image Ad",
        effective_status: "ACTIVE",
        creative: {
          title: "Same-day service",
          body: "Book in 60 seconds.",
          image_url: "https://img/full.jpg",
          thumbnail_url: "https://img/tiny.jpg",
          object_story_spec: { link_data: { picture: "https://img/link.jpg" } },
        },
      },
    ];
    const [ad] = buildAds([{ ad_id: "img", spend: "10", reach: "100", actions: [] }], meta);
    expect(ad.mediaType).toBe("image");
    expect(ad.videoId).toBe("");
    expect(ad.thumbnailUrl).toBe("https://img/full.jpg");
    expect(ad.headline).toBe("Same-day service");
    expect(ad.copy).toBe("Book in 60 seconds.");
  });

  it("parses a video creative: crisp poster, real copy from video_data, and a playable videoId", () => {
    const meta = [
      {
        id: "vid",
        name: "Video 2 | $100 OFF",
        effective_status: "ACTIVE",
        creative: {
          title: "",
          body: "",
          thumbnail_url: "https://img/blurry-tiny.jpg",
          object_story_spec: {
            video_data: {
              video_id: "vid_999",
              image_url: "https://img/crisp-poster.jpg",
              title: "Watch how we clean",
              message: "METRO DETROIT HOMEOWNERS, $100 off your first clean.",
            },
          },
        },
      },
    ];
    const [ad] = buildAds([{ ad_id: "vid", spend: "20", reach: "200", actions: [] }], meta);
    expect(ad.mediaType).toBe("video");
    expect(ad.videoId).toBe("vid_999");
    // The crisp poster wins over the tiny blurry auto-thumbnail.
    expect(ad.thumbnailUrl).toBe("https://img/crisp-poster.jpg");
    expect(ad.copy).toBe("METRO DETROIT HOMEOWNERS, $100 off your first clean.");
    expect(ad.headline).toBe("Watch how we clean");
  });

  it("reads campaign/ad-set names off the nested Meta objects, defaulting to empty strings when absent", () => {
    const insights = [
      { ad_id: "a", spend: "10", reach: "100", actions: [] },
      { ad_id: "b", spend: "20", reach: "200", actions: [] },
    ];
    const meta = [
      {
        id: "a",
        name: "A",
        effective_status: "ACTIVE",
        creative: {},
        campaign: { name: "Summer Promo" },
        adset: { name: "Lookalike 1%" },
      },
      { id: "b", name: "B", effective_status: "PAUSED", creative: {} },
    ];
    const ads = buildAds(insights, meta);
    expect(ads.find((a) => a.id === "a")).toMatchObject({
      campaignName: "Summer Promo",
      adsetName: "Lookalike 1%",
    });
    expect(ads.find((a) => a.id === "b")).toMatchObject({
      campaignName: "",
      adsetName: "",
    });
  });
});

describe("derivePhase", () => {
  const active = (status: string) => ({
    effective_status: "ACTIVE",
    learning_stage_info: { status },
  });

  it("returns learning when any active ad set is still LEARNING", () => {
    expect(derivePhase([active("SUCCESS"), active("LEARNING")])).toBe("learning");
  });

  it("returns scaling when learning has finished (SUCCESS / LEARNING_LIMITED)", () => {
    expect(derivePhase([active("SUCCESS")])).toBe("scaling");
    expect(derivePhase([active("LEARNING_LIMITED")])).toBe("scaling");
  });

  it("ignores paused ad sets and returns null when nothing is readable", () => {
    expect(
      derivePhase([{ effective_status: "PAUSED", learning_stage_info: { status: "LEARNING" } }]),
    ).toBeNull();
    expect(derivePhase([])).toBeNull();
    expect(derivePhase([active("")])).toBeNull();
  });
});
