import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAdsMedia, fetchImageCreatives, fetchVideos, str } from "./adsMedia";

// Pins the shaping/fetch behavior of the shared Paid Ads "Media" core, shared by
// the client endpoint and the admin cockpit. Videos come from /advideos; images
// come from the ad CREATIVES (never a raw /adimages dump), so Meta's
// auto-generated video-thumbnail images never show up as untitled "photos".

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

describe("fetchImageCreatives", () => {
  it("keeps images from photo creatives (inline url or hash-resolved) and skips video creatives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/adcreatives")) {
          return jsonRes({
            data: [
              // Photo ad with an inline image_url.
              { id: "c1", name: "Photo Ad", image_hash: "h1", image_url: "https://img.example/1.jpg" },
              // Photo ad that references its image only by hash -> resolved via /adimages.
              { id: "c2", name: "Hash Only", image_hash: "h2" },
              // Video ad: its image_hash is only the auto-thumbnail, so it is skipped.
              { id: "c3", name: "Video Ad", video_id: "v9", image_hash: "hv" },
            ],
          });
        }
        // /adimages resolver map.
        return jsonRes({ data: [{ hash: "h2", url: "https://img.example/2.jpg" }] });
      }),
    );

    const items = await fetchImageCreatives("tok", "act_1");

    expect(items).toEqual([
      { id: "h1", type: "image", url: "https://img.example/1.jpg", thumbnail: "https://img.example/1.jpg", name: "Photo Ad", live: false },
      { id: "h2", type: "image", url: "https://img.example/2.jpg", thumbnail: "https://img.example/2.jpg", name: "Hash Only", live: false },
    ]);
  });

  it("reads images nested in object_story_spec and asset_feed_spec, de-duped by hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/adcreatives")) {
          return jsonRes({
            data: [
              {
                id: "c1",
                name: "Link Ad",
                object_story_spec: { link_data: { image_hash: "h1", picture: "https://img.example/link.jpg" } },
              },
              {
                id: "c2",
                name: "Feed Ad",
                asset_feed_spec: { images: [{ hash: "h2", url: "https://img.example/feed.jpg" }] },
              },
              // Duplicate of h1 by a second creative: de-duped away.
              { id: "c3", name: "Dupe", image_hash: "h1", image_url: "https://img.example/dupe.jpg" },
            ],
          });
        }
        return jsonRes({ data: [] });
      }),
    );

    const items = await fetchImageCreatives("tok", "act_1");

    expect(items.map((i) => i.id)).toEqual(["h1", "h2"]);
  });

  it("returns an empty list (never throws) when the creatives call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    expect(await fetchImageCreatives("tok", "act_1")).toEqual([]);
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
      { id: "v1", type: "video", url: "https://fb.example/v1", thumbnail: "https://img.example/thumb1.jpg", name: "Video One", live: false },
      { id: "v2", type: "video", url: "https://img.example/thumb2.jpg", thumbnail: "https://img.example/thumb2.jpg", name: "Video Two", live: false },
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
      return jsonRes({ data: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildAdsMedia("tok", "555", undefined);

    expect(result.configured).toBe(true);
    // /advideos + /adcreatives + /adimages (image side) + /ads (live-marking).
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("merges videos and images, videos first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/advideos")) {
          return jsonRes({ data: [{ id: "v1", title: "Vid", picture: "https://img.example/t.jpg" }] });
        }
        if (url.pathname.endsWith("/adcreatives")) {
          return jsonRes({ data: [{ id: "c1", name: "Img", image_hash: "h1", image_url: "https://img.example/1.jpg" }] });
        }
        return jsonRes({ data: [] }); // /adimages resolver
      }),
    );

    const result = await buildAdsMedia("tok", "act_1", undefined);

    expect(result.configured).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual(["v1", "h1"]);
  });

  it("marks assets that back an ACTIVE ad as live, sorts them first, leaves the rest not-live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/advideos")) {
          return jsonRes({
            data: [
              { id: "vLive", title: "Running", picture: "https://img.example/live.jpg" },
              { id: "vPaused", title: "Shelved", picture: "https://img.example/paused.jpg" },
            ],
          });
        }
        if (url.pathname.endsWith("/adcreatives")) {
          return jsonRes({
            data: [
              { id: "c1", name: "Live Photo", image_hash: "hLive", image_url: "https://img.example/lp.jpg" },
              { id: "c2", name: "Old Photo", image_hash: "hOld", image_url: "https://img.example/op.jpg" },
            ],
          });
        }
        if (url.pathname.endsWith("/ads")) {
          // Only vLive and hLive are running; effective_status gates it.
          return jsonRes({
            data: [
              { effective_status: "ACTIVE", creative: { video_id: "vLive" } },
              { effective_status: "ACTIVE", creative: { image_hash: "hLive" } },
              { effective_status: "PAUSED", creative: { video_id: "vPaused" } },
            ],
          });
        }
        return jsonRes({ data: [] }); // /adimages resolver
      }),
    );

    const result = await buildAdsMedia("tok", "act_1", undefined);

    const byId = Object.fromEntries(result.items.map((i) => [i.id, i.live]));
    expect(byId).toEqual({ vLive: true, vPaused: false, hLive: true, hOld: false });
    // Live items sort ahead of the rest.
    expect(result.items.slice(0, 2).every((i) => i.live)).toBe(true);
  });

  it("degrades to configured:true with an error message when the Meta calls reject", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    // fetchVideos/fetchImageCreatives each swallow failures into [], so this
    // asserts the honest-empty result either way (never a fabricated item).
    const result = await buildAdsMedia("tok", "act_1", undefined);

    expect(result.configured).toBe(true);
    expect(result.items).toEqual([]);
  });
});
