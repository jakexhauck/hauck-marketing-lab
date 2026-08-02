import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONBOARDING_VIEW,
  ONBOARDING_VIEWS,
  clientSetupPath,
  onboardingViewDef,
  resolveOnboardingView,
} from "./onboardingViews";

describe("the views", () => {
  it("ships exactly the four, in order", () => {
    // Submissions sits next to setup because that is the order the work happens
    // in: a form arrives, then it becomes a client being stood up. Keys is
    // agency-wide rather than per client, and sits here anyway: standing a
    // client up is when a missing key gets discovered.
    expect(ONBOARDING_VIEWS.map((v) => v.id)).toEqual([
      "setup",
      "submissions",
      "management",
      "keys",
    ]);
  });

  it("opens on the client's setup", () => {
    expect(DEFAULT_ONBOARDING_VIEW).toBe("setup");
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
    expect(resolveOnboardingView("submissions")).toBe("submissions");
    expect(resolveOnboardingView("management")).toBe("management");
  });

  // A typed or stale ?view= lands somewhere real rather than on a blank page.
  it("falls back to the default for anything else", () => {
    expect(resolveOnboardingView(null)).toBe("setup");
    expect(resolveOnboardingView("")).toBe("setup");
    expect(resolveOnboardingView("retired-view")).toBe("setup");
  });

  // The board is gone, and every link and bookmark to it still works.
  it("lands an old pipeline link on the setup page", () => {
    expect(resolveOnboardingView("pipeline")).toBe("setup");
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
    expect(onboardingViewDef("submissions").label).toBe("Submissions");
    expect(onboardingViewDef("management").label).toBe("Management");
  });
});
