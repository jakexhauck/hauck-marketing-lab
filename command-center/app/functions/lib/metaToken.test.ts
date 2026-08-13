import { describe, it, expect } from "vitest";
import { maskToken, metaTokenSource, resolveMetaToken } from "./metaToken";
import type { Env } from "./env";

// The env var winning is the whole safety of this change: a token bound at
// deploy must never be shadowed by one pasted into a browser, or rotating the
// real one would silently do nothing.
const env = (over: Partial<Env> = {}) => over as Env;

describe("resolveMetaToken", () => {
  it("uses the deploy-bound token when there is one", async () => {
    expect(await resolveMetaToken(env({ META_SYSTEM_USER_TOKEN: "EAAG-live" }))).toBe("EAAG-live");
  });

  it("ignores an env var that is only whitespace", async () => {
    // No database configured either, so this proves it did not return "   ".
    expect(await resolveMetaToken(env({ META_SYSTEM_USER_TOKEN: "   " }))).toBeNull();
  });

  it("answers null rather than throwing when nothing is configured at all", async () => {
    expect(await resolveMetaToken(env())).toBeNull();
  });
});

describe("metaTokenSource", () => {
  it("names env when the deploy carries the token", async () => {
    expect(await metaTokenSource(env({ META_SYSTEM_USER_TOKEN: "EAAG" }))).toBe("env");
  });

  it("answers null when there is no token and no database", async () => {
    expect(await metaTokenSource(env())).toBeNull();
  });
});

describe("maskToken", () => {
  it("shows enough tail to tell two tokens apart, never enough to use one", () => {
    expect(maskToken("EAAGabcdefghijklmnop123456")).toBe("••••123456");
  });

  it("hides a short value entirely rather than leaking most of it", () => {
    expect(maskToken("abc123")).toBe("••••");
  });

  it("has nothing to say about a token that is not set", () => {
    expect(maskToken(null)).toBeNull();
  });
});
