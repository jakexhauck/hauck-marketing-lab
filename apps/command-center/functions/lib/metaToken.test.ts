import { describe, it, expect } from "vitest";
import { maskToken, metaTokenSource, resolveMetaToken } from "./metaToken";
import type { Env } from "./env";

// A stored token outranks the deploy-bound one. That ordering is what makes the
// wizard's box mean anything: an env var can only be changed by a deploy, and
// this app cannot deploy itself, so ranking it first would make Connect save a
// token and change nothing.
//
// These cases have no database configured, so they exercise the fallback half:
// with no row to find, the env var is what is left.
const env = (over: Partial<Env> = {}) => over as Env;

describe("resolveMetaToken", () => {
  it("falls back to the deploy-bound token when nothing is stored", async () => {
    expect(await resolveMetaToken(env({ META_SYSTEM_USER_TOKEN: "EAAG-live" }))).toBe("EAAG-live");
  });

  it("ignores an env var that is only whitespace", async () => {
    expect(await resolveMetaToken(env({ META_SYSTEM_USER_TOKEN: "   " }))).toBeNull();
  });

  it("answers null rather than throwing when nothing is configured at all", async () => {
    expect(await resolveMetaToken(env())).toBeNull();
  });
});

describe("metaTokenSource", () => {
  it("names env when the deploy carries the token and nothing is stored", async () => {
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
