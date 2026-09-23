import { afterEach, describe, expect, it, vi } from "vitest";
import { provisionLocation, WEBHOOK_URL_VALUE_NAME } from "./ghlProvision";

const gctx = { token: "tok", locationId: "loc1" };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("provisionLocation", () => {
  it("writes the webhook custom value and never touches tags", async () => {
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
        return jsonRes(404, {});
      }),
    );

    const items = await provisionLocation(gctx, "https://x/hook");

    expect(items).toEqual([
      { kind: "custom_value", name: WEBHOOK_URL_VALUE_NAME, outcome: "created" },
    ]);
    expect(calls.some((c) => c.includes("/tags"))).toBe(false);
  });
});
