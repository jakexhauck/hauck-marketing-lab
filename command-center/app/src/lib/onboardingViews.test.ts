import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONBOARDING_VIEW,
  ONBOARDING_VIEWS,
  clientSetupPath,
  onboardingViewDef,
  resolveOnboardingView,
} from "./onboardingViews";

describe("the views", () => {
  it("ships exactly the three, in order", () => {
    expect(ONBOARDING_VIEWS.map((v) => v.id)).toEqual(["pipeline", "setup", "management"]);
  });

  it("opens on the pipeline", () => {
    expect(DEFAULT_ONBOARDING_VIEW).toBe("pipeline");
  });

  it("gives every view a label and a line about it", () => {
    for (const v of ONBOARDING_VIEWS) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.blurb.length).toBeGreaterThan(15);
    }
  });
});

describe("resolveOnboardingView", () => {
  it("takes the view the URL names", () => {
    expect(resolveOnboardingView("setup")).toBe("setup");
    expect(resolveOnboardingView("pipeline")).toBe("pipeline");
  });

  // A typed or stale ?view= lands somewhere real rather than on a blank page.
  it("falls back to the default for anything else", () => {
    expect(resolveOnboardingView(null)).toBe("pipeline");
    expect(resolveOnboardingView("")).toBe("pipeline");
    expect(resolveOnboardingView("retired-view")).toBe("pipeline");
  });
});

describe("clientSetupPath", () => {
  it("points at the setup view with that client selected", () => {
    expect(clientSetupPath("abc-123")).toBe(
      "/admin/onboarding?view=setup&client=abc-123",
    );
  });

  it("resolves back to the view it names", () => {
    const url = new URL(clientSetupPath("abc-123"), "https://app.example.com");
    expect(resolveOnboardingView(url.searchParams.get("view"))).toBe("setup");
    expect(url.searchParams.get("client")).toBe("abc-123");
  });

  it("escapes what it is given", () => {
    expect(clientSetupPath("a b&c")).toContain("client=a%20b%26c");
  });
});

describe("onboardingViewDef", () => {
  it("finds the definition, and never returns nothing", () => {
    expect(onboardingViewDef("setup").label).toBe("Client setup");
    expect(onboardingViewDef("pipeline").label).toBe("Pipeline");
  });
});
