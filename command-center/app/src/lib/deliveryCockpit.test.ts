import { describe, expect, it } from "vitest";
import {
  COCKPIT_TABS,
  DEFAULT_COCKPIT_TAB,
  cockpitPlaceholder,
  resolveCockpitTab,
} from "./deliveryCockpit";

describe("resolveCockpitTab", () => {
  it("keeps a known tab id", () => {
    expect(resolveCockpitTab("overview")).toBe("overview");
    expect(resolveCockpitTab("config")).toBe("config");
    expect(resolveCockpitTab("team")).toBe("team");
  });

  it("falls back to the default for missing or unknown values", () => {
    expect(resolveCockpitTab(null)).toBe(DEFAULT_COCKPIT_TAB);
    expect(resolveCockpitTab(undefined)).toBe(DEFAULT_COCKPIT_TAB);
    expect(resolveCockpitTab("")).toBe(DEFAULT_COCKPIT_TAB);
    expect(resolveCockpitTab("nope")).toBe(DEFAULT_COCKPIT_TAB);
  });

  it("defaults to config while it is the only working tab", () => {
    expect(DEFAULT_COCKPIT_TAB).toBe("config");
  });
});

describe("COCKPIT_TABS", () => {
  it("marks only config ready for now", () => {
    const ready = COCKPIT_TABS.filter((t) => t.ready).map((t) => t.id);
    expect(ready).toEqual(["config"]);
  });

  it("has unique tab ids", () => {
    const ids = COCKPIT_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cockpitPlaceholder", () => {
  it("phrases the coming-soon copy per tab", () => {
    const overview = COCKPIT_TABS.find((t) => t.id === "overview")!;
    expect(cockpitPlaceholder(overview)).toBe("Overview is coming in the next phase.");
  });
});
