import { describe, it, expect, vi, afterEach } from "vitest";
import { GRAPH, graphGet, graphGetAll, resolveAdAccount } from "./metaGraph";

// Shared Meta Graph helpers, extracted from functions/api/ads/insights.ts and
// functions/api/ads/media.ts so both endpoints call one implementation. This
// suite pins the behavior of each piece before/after the extraction: the
// precedence rule in resolveAdAccount, the URL/error-handling contract of
// graphGet, and the paging contract (including the MAX_PAGES cap) of
// graphGetAll.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAdAccount", () => {
  it("prefers the tenant's account over the env fallback", () => {
    expect(resolveAdAccount("act_111", "act_999")).toBe("act_111");
  });

  it("falls back to the env account when the tenant has none (single-tenant deploy)", () => {
    expect(resolveAdAccount(undefined, "act_999")).toBe("act_999");
    expect(resolveAdAccount("", "act_999")).toBe("act_999");
    expect(resolveAdAccount("   ", "act_999")).toBe("act_999");
  });

  it("returns undefined (not-connected) when neither is set", () => {
    expect(resolveAdAccount(undefined, undefined)).toBeUndefined();
    expect(resolveAdAccount("", "")).toBeUndefined();
  });

  it("trims surrounding whitespace on the chosen value", () => {
    expect(resolveAdAccount(" act_111 ", "act_999")).toBe("act_111");
  });
});

describe("graphGet", () => {
  it("builds the URL from GRAPH + path + params + access_token and returns the parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await graphGet("tok-123", "/act_1/insights", { level: "account", date_preset: "this_month" });

    expect(result).toEqual({ data: [{ id: "1" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe(GRAPH + "/act_1/insights");
    expect(calledUrl.searchParams.get("level")).toBe("account");
    expect(calledUrl.searchParams.get("date_preset")).toBe("this_month");
    expect(calledUrl.searchParams.get("access_token")).toBe("tok-123");
  });

  it("throws with the status and a truncated body when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request from meta",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(graphGet("tok", "/act_1/ads", {})).rejects.toThrow(/Meta 400/);
  });
});

describe("graphGetAll", () => {
  it("follows paging.next and concatenates every page's data", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://graph.facebook.com/v21.0/next-page-1") {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: "b" }],
            paging: { next: "https://graph.facebook.com/v21.0/next-page-2" },
          }),
        };
      }
      if (url === "https://graph.facebook.com/v21.0/next-page-2") {
        return {
          ok: true,
          json: async () => ({ data: [{ id: "c" }] }),
        };
      }
      // The first call: the plain graphGet built URL (has ?limit=...&access_token=...).
      return {
        ok: true,
        json: async () => ({
          data: [{ id: "a" }],
          paging: { next: "https://graph.facebook.com/v21.0/next-page-1" },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await graphGetAll("tok", "/act_1/adimages", { limit: "200" });

    expect(rows).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops when a page has no paging.next", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "only" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await graphGetAll("tok", "/act_1/adimages", {});

    expect(rows).toEqual([{ id: "only" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects the MAX_PAGES cap (10) even when every page has a next cursor", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        json: async () => ({
          data: [{ id: `page-${call}` }],
          paging: { next: `https://graph.facebook.com/v21.0/page-${call + 1}` },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await graphGetAll("tok", "/act_1/advideos", {});

    expect(rows).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("defaults maxPages to 10 but honors an explicit override", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        json: async () => ({
          data: [{ id: `p${call}` }],
          paging: { next: `https://graph.facebook.com/v21.0/p${call + 1}` },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await graphGetAll("tok", "/act_1/adimages", {}, 3);

    expect(rows).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("breaks the loop if a followed next-page fetch is not ok", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://graph.facebook.com/v21.0/broken") {
        return { ok: false, status: 500, text: async () => "boom" };
      }
      // The first call: the plain graphGet built URL.
      return {
        ok: true,
        json: async () => ({
          data: [{ id: "first" }],
          paging: { next: "https://graph.facebook.com/v21.0/broken" },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await graphGetAll("tok", "/act_1/adimages", {});

    expect(rows).toEqual([{ id: "first" }]);
  });
});
