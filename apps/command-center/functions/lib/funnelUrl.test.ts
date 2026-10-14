import { describe, it, expect } from "vitest";
import type { Env } from "./env";
import { funnelOrigin, funnelOriginAllowed, funnelUrl } from "./funnelUrl";

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

describe("funnelOriginAllowed", () => {
  // 2026-09-22: the site moved to GHL and www began redirecting to the bare
  // domain. FUNNEL_URL still said www, so the form loaded from the bare domain,
  // the API refused its origin and every client saw "Failed to fetch".
  it("accepts the bare domain when the link says www", () => {
    const e = env("https://www.hauckmarketing.com/onboarding-form");
    expect(funnelOriginAllowed("https://hauckmarketing.com", e)).toBe(true);
    expect(funnelOriginAllowed("https://www.hauckmarketing.com", e)).toBe(true);
  });

  it("accepts www when the link is the bare domain", () => {
    const e = env("https://hauckmarketing.com/onboarding-form");
    expect(funnelOriginAllowed("https://www.hauckmarketing.com", e)).toBe(true);
  });

  it("refuses other hosts, other subdomains and plain http", () => {
    const e = env("https://www.hauckmarketing.com/onboarding-form");
    expect(funnelOriginAllowed("https://evil.com", e)).toBe(false);
    expect(funnelOriginAllowed("https://go.hauckmarketing.com", e)).toBe(false);
    expect(funnelOriginAllowed("http://hauckmarketing.com", e)).toBe(false);
    expect(funnelOriginAllowed("https://hauckmarketing.com.evil.com", e)).toBe(false);
  });

  it("refuses everything when there is no funnel", () => {
    expect(funnelOriginAllowed("https://hauckmarketing.com", env())).toBe(false);
  });
});
