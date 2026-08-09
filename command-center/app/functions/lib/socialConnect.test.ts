import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachPage,
  isConnectPlatform,
  isGhlId,
  listPages,
  resolveGhlUserId,
  shapePages,
  startOAuth,
} from "./socialConnect";
import type { GhlContext } from "./ghl";

const ctx: GhlContext = { token: "pit-test", locationId: "LOC123" };

function stubFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init) as Response;
  });
  return calls;
}

function jsonRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("guards", () => {
  it("accepts only the two platforms we ship", () => {
    expect(isConnectPlatform("facebook")).toBe(true);
    expect(isConnectPlatform("instagram")).toBe(true);
    expect(isConnectPlatform("tiktok")).toBe(false);
    expect(isConnectPlatform("")).toBe(false);
  });

  it("rejects anything that would escape the URL path", () => {
    expect(isGhlId("6a4aaa380cfce0eb1ac34866")).toBe(true);
    expect(isGhlId("../../admin")).toBe(false);
    expect(isGhlId("abc/def")).toBe(false);
    expect(isGhlId("abc?x=1")).toBe(false);
    expect(isGhlId("")).toBe(false);
    expect(isGhlId(null)).toBe(false);
  });
});

describe("startOAuth", () => {
  it("returns GHL's redirect target without following it", async () => {
    const calls = stubFetch(() => {
      const headers = new Headers();
      headers.set("location", "https://www.facebook.com/dialog/oauth?state=signed");
      return { ok: false, status: 302, headers, json: async () => ({}), text: async () => "" };
    });

    const url = await startOAuth(ctx, "facebook", "USER1");

    expect(url).toBe("https://www.facebook.com/dialog/oauth?state=signed");
    expect(calls[0].url).toContain("/social-media-posting/oauth/facebook/start");
    expect(calls[0].url).toContain("locationId=LOC123");
    expect(calls[0].url).toContain("userId=USER1");
    // Following the redirect would fetch Facebook's HTML with our server's IP
    // and leave the client with nothing to consent to.
    expect(calls[0].init.redirect).toBe("manual");
  });

  it("fails loudly when GHL answers without a redirect", async () => {
    // Seen when the tenant's token lacks the socialplanner scope.
    stubFetch(() => jsonRes({ message: "no" }, 200));
    await expect(startOAuth(ctx, "facebook", "USER1")).rejects.toThrow(/no redirect/);
  });
});

describe("shapePages", () => {
  it("reads GHL's wrapped results, preferring originId", () => {
    const pages = shapePages({
      results: {
        pages: [
          { originId: "1122", name: "Willis Window Washing", avatar: "https://x/y.png" },
        ],
      },
    });
    expect(pages).toEqual([
      {
        id: "1122",
        name: "Willis Window Washing",
        avatar: "https://x/y.png",
        raw: { originId: "1122", name: "Willis Window Washing", avatar: "https://x/y.png" },
      },
    ]);
  });

  it("accepts the alternative field names GHL has shipped", () => {
    expect(shapePages({ results: { accounts: [{ id: "9", pageName: "A" }] } })[0]).toMatchObject({
      id: "9",
      name: "A",
    });
    expect(shapePages({ data: [{ pageId: "8", title: "B" }] })[0]).toMatchObject({
      id: "8",
      name: "B",
    });
    expect(shapePages([{ accountId: "7", username: "C" }])[0]).toMatchObject({
      id: "7",
      name: "C",
    });
  });

  it("drops a row it cannot render rather than inventing one", () => {
    expect(shapePages({ results: { pages: [{ name: "no id" }, { originId: "1" }] } })).toEqual([]);
  });

  it("survives a payload of the wrong shape entirely", () => {
    expect(shapePages(null)).toEqual([]);
    expect(shapePages({ results: {} })).toEqual([]);
    expect(shapePages("nonsense")).toEqual([]);
  });
});

describe("resolveGhlUserId", () => {
  it("prefers an admin user", async () => {
    stubFetch(() =>
      jsonRes({
        users: [
          { id: "staffAAA", roles: { role: "user" } },
          { id: "adminBBB", roles: { role: "admin" } },
        ],
      }),
    );
    expect(await resolveGhlUserId(ctx)).toBe("adminBBB");
  });

  it("falls back to the location id when the users scope is missing", async () => {
    // A client must never be blocked from connecting because we could not read
    // a staff list. Worse owner field, working feature.
    stubFetch(() => jsonRes({ message: "forbidden" }, 403));
    expect(await resolveGhlUserId(ctx)).toBe("LOC123");
  });

  it("falls back when the list is empty or malformed", async () => {
    stubFetch(() => jsonRes({ users: [] }));
    expect(await resolveGhlUserId(ctx)).toBe("LOC123");
  });
});

describe("listPages", () => {
  it("scopes the request to the session's location, not the caller's", async () => {
    const calls = stubFetch(() => jsonRes({ results: { pages: [{ originId: "1", name: "P" }] } }));
    await listPages(ctx, "instagram", "ACC1");
    expect(calls[0].url).toContain("/social-media-posting/oauth/LOC123/instagram/accounts/ACC1");
  });
});

describe("attachPage", () => {
  it("re-reads the page server-side and posts GHL's own record back", async () => {
    const raw = { originId: "1122", name: "Willis", avatar: null, extra: "keep-me" };
    const calls = stubFetch((_url, init) =>
      init.method === "POST" ? jsonRes({ ok: true }) : jsonRes({ results: { pages: [raw] } }),
    );

    const page = await attachPage(ctx, "facebook", "ACC1", "1122");

    expect(page.name).toBe("Willis");
    const post = calls.find((c) => c.init.method === "POST")!;
    expect(post.url).toContain("/social-media-posting/oauth/LOC123/facebook/accounts/ACC1");
    const body = JSON.parse(String(post.init.body));
    // GHL's attach body wants the whole record and no real one has been seen,
    // so echoing what it just gave us is the only shape guaranteed to be right.
    expect(body.extra).toBe("keep-me");
    expect(body.originId).toBe("1122");
    expect(body.type).toBe("page");
  });

  it("refuses a page id that was not in GHL's list", async () => {
    // The browser supplies this id, so an unlisted one must never be attached.
    stubFetch(() => jsonRes({ results: { pages: [{ originId: "1122", name: "Willis" }] } }));
    await expect(attachPage(ctx, "facebook", "ACC1", "9999")).rejects.toThrow(/no longer available/);
  });
});
