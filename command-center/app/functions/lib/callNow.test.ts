import { describe, expect, it } from "vitest";
import { callNowKey, callNowPage, keysMatch, parseCallNowParams } from "./callNow";

const LOC = "yVfX127fswQ03fydxBQg";

describe("callNowKey", () => {
  it("is 32 hex chars, stable, and differs per location", async () => {
    const a = await callNowKey("s3cret", LOC);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await callNowKey("s3cret", LOC)).toBe(a);
    expect(await callNowKey("s3cret", "OznT3yyuwK3dqVXDsCaD")).not.toBe(a);
    expect(await callNowKey("other", LOC)).not.toBe(a);
  });
});

describe("parseCallNowParams", () => {
  const url = (q: string) => new URL(`https://x.test/api/call-now?${q}`);
  const k = "a".repeat(32);

  it("reads l, c and k", () => {
    expect(parseCallNowParams(url(`l=${LOC}&c=abc12345XYZ&k=${k}`))).toEqual({
      locationId: LOC,
      contactId: "abc12345XYZ",
      key: k,
    });
  });

  it("rejects missing, malformed or unrendered merge fields", () => {
    expect(parseCallNowParams(url(`l=${LOC}&k=${k}`))).toBeNull();
    expect(parseCallNowParams(url(`l=${LOC}&c={{contact.id}}&k=${k}`))).toBeNull();
    expect(parseCallNowParams(url(`l=${LOC}&c=abc12345XYZ&k=short`))).toBeNull();
  });
});

describe("keysMatch", () => {
  it("compares exactly", () => {
    expect(keysMatch("abc", "abc")).toBe(true);
    expect(keysMatch("abc", "abd")).toBe(false);
    expect(keysMatch("abc", "abcd")).toBe(false);
  });
});

describe("callNowPage", () => {
  it("only posts from the button, never on load", () => {
    const page = callNowPage({ title: "Call this lead?", button: { action: "/api/call-now?l=1&c=2" } });
    expect(page).toContain('method="post"');
    expect(page).toContain("&#38;c=2");
    expect(callNowPage({ title: "Done" })).not.toContain("<form");
  });
});
