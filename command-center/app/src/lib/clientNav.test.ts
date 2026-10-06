import { describe, it, expect } from "vitest";
import {
  clientNavGroups,
  clientPath,
  parseClientPath,
  resolveClientPage,
  switchTarget,
  legacyClientPath,
  type ClientGateInfo,
} from "./clientNav";

const linked: ClientGateInfo = { metaAdAccountId: "act_1", ghlConnected: true, onboardingStatus: "live" };
const bare: ClientGateInfo = { metaAdAccountId: null, ghlConnected: false, onboardingStatus: "setup" };

const labels = (c: ClientGateInfo) =>
  clientNavGroups(c).map((g) => [g.caption, g.rows.map((r) => r.label)]);

describe("clientNavGroups", () => {
  it("lists every page for a fully wired client", () => {
    expect(labels(linked)).toEqual([
      [null, ["Onboarding", "Software"]],
      ["Paid Ads", ["Dashboard", "Lead Tracker", "Meta Data", "Creatives", "Ad Builder"]],
      ["GHL", ["Conversion Assets", "Follow-up Texts", "Custom Values", "CAPI", "Calendars"]],
      [null, ["Setter Suite", "Management"]],
    ]);
  });

  it("gates Paid Ads and GHL until they are connected", () => {
    expect(labels(bare)).toEqual([
      [null, ["Onboarding", "Software"]],
      ["Paid Ads", ["Connect ads", "Creatives", "Ad Builder"]],
      ["GHL", ["Connect GHL", "Conversion Assets", "Follow-up Texts", "Custom Values", "CAPI"]],
      [null, ["Setter Suite", "Management"]],
    ]);
  });

  it("treats a blank ad account id as not linked", () => {
    const rows = clientNavGroups({ ...linked, metaAdAccountId: "  " })[1].rows;
    expect(rows[0].sub).toBe("setup");
  });

  it("marks the last group with a rule instead of a caption", () => {
    const groups = clientNavGroups(linked);
    expect(groups[3].rule).toBe(true);
    expect(groups[0].rule).toBeFalsy();
  });
});

describe("clientPath / parseClientPath", () => {
  it("builds addresses with and without a sub-page", () => {
    expect(clientPath("t1", "software")).toBe("/admin/client/t1/software");
    expect(clientPath("t1", "paid-ads", "leads")).toBe("/admin/client/t1/paid-ads/leads");
  });

  it("round-trips", () => {
    expect(parseClientPath("/admin/client/t1/paid-ads/leads")).toEqual({
      tenantId: "t1",
      page: "paid-ads",
      sub: "leads",
    });
    expect(parseClientPath("/admin/client/t1/software")).toEqual({
      tenantId: "t1",
      page: "software",
      sub: null,
    });
  });

  it("returns null outside a client", () => {
    expect(parseClientPath("/admin/pillar/operations")).toBeNull();
    expect(parseClientPath("/admin/client/")).toBeNull();
  });
});

describe("resolveClientPage", () => {
  it("returns null for an unknown page", () => {
    expect(resolveClientPage(linked, "billing", null)).toBeNull();
  });

  it("fills in the first sub-page when none is given", () => {
    expect(resolveClientPage(linked, "paid-ads", null)).toEqual({ page: "paid-ads", sub: "dashboard" });
    expect(resolveClientPage(linked, "ghl", null)).toEqual({ page: "ghl", sub: "conversion-assets" });
  });

  it("sends a gated sub-page to the connect step", () => {
    expect(resolveClientPage(bare, "paid-ads", "dashboard")).toEqual({ page: "paid-ads", sub: "setup" });
    expect(resolveClientPage(bare, "ghl", "calendars")).toEqual({ page: "ghl", sub: "connect" });
  });

  it("keeps an offered sub-page", () => {
    expect(resolveClientPage(bare, "paid-ads", "creatives")).toEqual({ page: "paid-ads", sub: "creatives" });
  });

  it("drops a sub-page on a page that has none", () => {
    expect(resolveClientPage(linked, "software", "x")).toEqual({ page: "software", sub: null });
  });

  it("drops the connect step once connected", () => {
    expect(resolveClientPage(linked, "paid-ads", "setup")).toEqual({ page: "paid-ads", sub: "dashboard" });
  });
});

describe("switchTarget", () => {
  it("keeps the same page and sub-page between clients", () => {
    expect(switchTarget({ page: "paid-ads", sub: "leads" }, { id: "t2", ...linked })).toBe(
      "/admin/client/t2/paid-ads/leads",
    );
  });

  it("falls back inside the group when the sub-page is gated", () => {
    expect(switchTarget({ page: "paid-ads", sub: "leads" }, { id: "t2", ...bare })).toBe(
      "/admin/client/t2/paid-ads/setup",
    );
  });

  it("moves off the connect step onto a wired client's first page", () => {
    expect(switchTarget({ page: "paid-ads", sub: "setup" }, { id: "t2", ...linked })).toBe(
      "/admin/client/t2/paid-ads/dashboard",
    );
  });

  it("from agency, opens setup clients on Onboarding and live ones on Paid Ads", () => {
    expect(switchTarget(null, { id: "t2", ...bare })).toBe("/admin/client/t2/onboarding");
    expect(switchTarget(null, { id: "t2", ...linked })).toBe("/admin/client/t2/paid-ads/dashboard");
  });
});

describe("legacyClientPath", () => {
  it("maps old Fulfillment pages", () => {
    expect(legacyClientPath("software", null, "t1")).toBe("/admin/client/t1/software");
    expect(legacyClientPath("paid-ads", "leads", "t1")).toBe("/admin/client/t1/paid-ads/leads");
    expect(legacyClientPath("ghl", "calendars", "t1")).toBe("/admin/client/t1/ghl/calendars");
  });

  it("maps retired cockpit tabs", () => {
    expect(legacyClientPath("billing", null, "t1")).toBe("/admin/client/t1/management");
    expect(legacyClientPath("config", null, "t1")).toBe("/admin/client/t1/management");
    expect(legacyClientPath("overview", null, "t1")).toBe("/admin/client/t1/software");
  });

  it("maps onboarding and unknown pages", () => {
    expect(legacyClientPath("onboarding", null, "t1")).toBe("/admin/client/t1/onboarding");
    expect(legacyClientPath(null, null, "t1")).toBe("/admin/client/t1/software");
    expect(legacyClientPath("nonsense", "x", "t1")).toBe("/admin/client/t1/software");
  });
});
