import { describe, it, expect } from "vitest";
import type { Env } from "./env";
import { funnelOrigin, funnelUrl } from "./funnelUrl";

const env = (FUNNEL_URL?: string): Env => ({ FUNNEL_URL }) as unknown as Env;

describe("funnelUrl", () => {
  it("gives back the whole link, which is what a client is sent", () => {
    expect(funnelUrl(env("https://hauckmarketing.com/onboarding-form"))).toBe(
      "https://hauckmarketing.com/onboarding-form",
    );
  });

  it("is null while the funnel is not published", () => {
    expect(funnelUrl(env())).toBeNull();
    expect(funnelUrl(env("   "))).toBeNull();
  });

  it("refuses anything that is not a web address", () => {
    expect(funnelUrl(env("hauckmarketing.com/onboarding-form"))).toBeNull();
    expect(funnelUrl(env("javascript:alert(1)"))).toBeNull();
  });

  it("drops a trailing slash so the link reads the way it is written", () => {
    expect(funnelUrl(env("https://hauckmarketing.com/onboarding-form/"))).toBe(
      "https://hauckmarketing.com/onboarding-form",
    );
  });
});

describe("funnelOrigin", () => {
  // The whole reason these are one setting: a link and an allowed origin that
  // disagree produce a form that looks live and silently cannot save.
  it("is the origin of the link, path and all removed", () => {
    expect(funnelOrigin(env("https://hauckmarketing.com/onboarding-form"))).toBe(
      "https://hauckmarketing.com",
    );
    expect(funnelOrigin(env("https://go.hauckmarketing.com/intake?utm=x"))).toBe(
      "https://go.hauckmarketing.com",
    );
  });

  it("is null when there is no funnel", () => {
    expect(funnelOrigin(env())).toBeNull();
  });
});
