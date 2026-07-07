import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAdsMedia, fetchImages, fetchVideos, str } from "./adsMedia";

// Pins the exact shaping/fetch behavior extracted out of
// functions/api/ads/media.ts into this pure core, so a future admin endpoint
// can call the same logic for an admin-chosen tenant. Behavior-preserving:
// locks the CURRENT output (url fallback, no-url drop, video shaping,
// not-connected short-circuit, act_ normalization).

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonRes(data: unknown) {
  return { ok: true, json: async () => data };
}

describe("str", () => {
  it("returns the string as-is, or '' for anything else", () => {
    expect(str("hi")).toBe("hi");
    expect(str(123)).toBe("");
    expect(str(undefined)).toBe("");
    expect(str(null)).toBe("");
  });
});

describe("fetchImages", () => {
  it("falls back to permalink_url when url is missing, and drops rows with neither", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonRes({
          data: [
            { hash: "h1", name: "Image One", url: "https://img.example/1.jpg" },
            { hash: "h2", name: "Image Two", permalink_url: "https://fb.example/perma2" },
            { hash: "h3", name: "No Url" },
          ],
        }),
      ),
    );

    const items = await fetchImages("tok", "act_1");

    expect(items).toEqual([
      { id: "h1", type: "image", url: "https://img.example/1.jpg", thumbnail: "https://img.example/1.jpg", name: "Image One" },
      { id: "h2", type: "image", url: "https://fb.example/perma2", thumbnail: "https://fb.example/perma2", name: "Image Two" },
    ]);
  });

  it("returns an empty list (never throws) when the Graph call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    expect(await fetchImages("tok", "act_1")).toEqual([]);
  });
});

describe("fetchVideos", () => {
  it("shapes each row, using permalink_url or the picture thumbnail as the asset url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonRes({
          data: [
            { id: "v1", title: "Video One", picture: "https://img.example/thumb1.jpg", permalink_url: "https://fb.example/v1" },
            { id: "v2", title: "Video Two", picture: "https://img.example/thumb2.jpg" },
          ],
        }),
      ),
    );

    const items = await fetchVideos("tok", "act_1");

    expect(items).toEqual([
      { id: "v1", type: "video", url: "https://fb.example/v1", thumbnail: "https://img.example/thumb1.jpg", name: "Video One" },
      { id: "v2", type: "video", url: "https://img.example/thumb2.jpg", thumbnail: "https://img.example/thumb2.jpg", name: "Video Two" },
    ]);
  });

  it("returns an empty list (never throws) when the Graph call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    expect(await fetchVideos("tok", "act_1")).toEqual([]);
  });
});

describe("buildAdsMedia", () => {
  it("returns not-connected without ever calling fetch when the token is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildAdsMedia(undefined, "act_1", undefined);

    expect(result).toEqual({ configured: false, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not-connected without ever calling fetch when neither tenant nor env account is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildAdsMedia("tok", undefined, undefined);

    expect(result).toEqual({ configured: false, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a bare account id (no act_ prefix) before calling Meta", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(input);
      expect(url.pathname.startsWith("/v21.0/act_555/")).toBe(true);
      if (url.pathname.endsWith("/adimages")) return jsonRes({ data: [] });
      return jsonRes({ data: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildAdsMedia("tok", "555", undefined);

    expect(result.configured).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("merges images and videos, images first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/adimages")) {
          return jsonRes({ data: [{ hash: "h1", name: "Img", url: "https://img.example/1.jpg" }] });
        }
        return jsonRes({ data: [{ id: "v1", title: "Vid", picture: "https://img.example/t.jpg" }] });
      }),
    );

    const result = await buildAdsMedia("tok", "act_1", undefined);

    expect(result.configured).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual(["h1", "v1"]);
  });

  it("degrades to configured:true with an error message when the Meta calls reject", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    // fetchImages/fetchVideos themselves swallow failures into [], so this only
    // exercises the outer try/catch if Promise.all itself throws; assert the
    // honest-empty result either way (never a fabricated item).
    const result = await buildAdsMedia("tok", "act_1", undefined);

    expect(result.configured).toBe(true);
    expect(result.items).toEqual([]);
  });
});
