import { describe, expect, it } from "vitest";
import { isPoisonedPrecache } from "./precacheGuard";

const html = (url: string) => ({ url, contentType: "text/html; charset=utf-8" });

describe("isPoisonedPrecache", () => {
  it("rejects the SPA fallback page served for a script or stylesheet", () => {
    expect(isPoisonedPrecache(html("https://app.x.com/assets/index-DCM4A3vV.js"))).toBe(true);
    expect(isPoisonedPrecache(html("https://app.x.com/assets/index-BIJQpu0O.css"))).toBe(true);
    expect(isPoisonedPrecache(html("https://app.x.com/registerSW.js"))).toBe(true);
  });

  it("keeps the real files", () => {
    expect(
      isPoisonedPrecache({ url: "https://app.x.com/assets/a.js", contentType: "application/javascript" }),
    ).toBe(false);
    expect(isPoisonedPrecache({ url: "https://app.x.com/assets/a.css", contentType: "text/css" })).toBe(false);
  });

  it("keeps HTML where HTML belongs", () => {
    expect(isPoisonedPrecache(html("https://app.x.com/index.html?__WB_REVISION__=abc"))).toBe(false);
    expect(isPoisonedPrecache(html("https://app.x.com/"))).toBe(false);
  });

  it("ignores a missing content type", () => {
    expect(isPoisonedPrecache({ url: "https://app.x.com/assets/a.js", contentType: null })).toBe(false);
  });
});
