import { afterEach, describe, expect, it, vi } from "vitest";
import { provisionLocation } from "./ghlProvision";

const gctx = { token: "tok", locationId: "loc1" };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Routes each call by method + path. The tag list GET answers 401 the way the
// Marketplace app token really does: it holds locations/tags.write only.
function mockGhl(tagPost: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      calls.push(`${method} ${url}`);
      if (url.endsWith("/customValues") && method === "GET") {
        return jsonRes(200, { customValues: [] });
      }
      if (url.endsWith("/customValues")) return jsonRes(200, {});
      if (url.endsWith("/tags") && method === "GET") {
        return jsonRes(401, { message: "The token is not authorized for this scope." });
      }
      if (url.endsWith("/tags")) return tagPost();
      return jsonRes(404, {});
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("provisionLocation tags", () => {
  it("creates a missing tag without reading the tag list", async () => {
    const calls = mockGhl(() => jsonRes(201, { tag: { id: "t1" } }));
    const items = await provisionLocation(gctx, "https://x/hook");
    const tag = items.find((i) => i.kind === "tag");
    expect(tag?.outcome).toBe("created");
    expect(calls.some((c) => c.startsWith("GET") && c.endsWith("/tags"))).toBe(false);
  });

  it("treats GHL's already-exists answer as already correct", async () => {
    mockGhl(() =>
      jsonRes(400, { status: 400, message: "The tag name is already exist." }),
    );
    const items = await provisionLocation(gctx, "https://x/hook");
    expect(items.find((i) => i.kind === "tag")?.outcome).toBe("already correct");
  });

  it("still reports a real refusal as failed", async () => {
    mockGhl(() => jsonRes(403, { message: "Forbidden" }));
    const items = await provisionLocation(gctx, "https://x/hook");
    expect(items.find((i) => i.kind === "tag")?.outcome).toMatch(/^failed/);
  });
});
