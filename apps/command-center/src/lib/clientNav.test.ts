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

const AGENT_NAMES = [
  "Manager Agent",
  "Market Research Agent",
  "Ads Agent",
  "Creative Agent",
  "Landing Page Agent",
  "GHL Agent",
  "Reporting Agent",
];

const labels = (c: ClientGateInfo) =>
  clientNavGroups(c).map((g) => [g.caption, g.rows.map((r) => r.label)]);

describe("clientNavGroups", () => {
  it("lists every page for a fully wired client, Brief on top", () => {
    expect(labels(linked)).toEqual([
      [null, ["Brief"]],
      ["Agents", AGENT_NAMES],
      ["Paid Ads", ["Dashboard", "Lead Tracker", "Meta Data", "Creatives", "Copy & Angles", "Lead Form"]],
      ["GHL", ["Conversion Assets", "Custom Values", "Calendars"]],
      [null, ["Management", "Image Converter"]],
    ]);
  });

  it("gates Paid Ads and GHL until they are connected", () => {
    expect(labels(bare)).toEqual([
      [null, ["Brief"]],
      ["Agents", AGENT_NAMES],
      ["Paid Ads", ["Connect ads", "Creatives", "Copy & Angles", "Lead Form"]],
      ["GHL", ["Connect GHL", "Conversion Assets"]],
      [null, ["Management", "Image Converter"]],
    ]);
  });

  it("treats a blank ad account id as not linked", () => {
    const rows = clientNavGroups({ ...linked, metaAdAccountId: "  " })[2].rows;
    expect(rows[0].sub).toBe("setup");
  });

  it("puts the Client Brief at the top of the rail, as its own page", () => {
    const rows = clientNavGroups(bare)[0].rows;
    expect(rows[0]).toEqual({ page: "brief", sub: null, label: "Brief" });
    expect(clientPath("t1", "brief")).toBe("/admin/client/t1/brief");
    expect(resolveClientPage(bare, "brief", "x")).toEqual({ page: "brief", sub: null });
  });

  it("marks the last group with a rule instead of a caption", () => {
    const groups = clientNavGroups(linked);
    expect(groups[4].rule).toBe(true);
    expect(groups[0].rule).toBeFalsy();
  });

  it("gives every agent a row on the agent page, keyed by its id", () => {
    const rows = clientNavGroups(bare)[1].rows;
    expect(rows.map((r) => [r.page, r.sub])).toEqual([
      ["agent", "manager"],
      ["agent", "research"],
      ["agent", "ads"],
      ["agent", "creative"],
      ["agent", "landing"],
      ["agent", "ghl"],
      ["agent", "reporting"],
    ]);
  });
});

describe("resolveClientPage, agents", () => {
  it("keeps a real agent", () => {
    expect(resolveClientPage(linked, "agent", "ads")).toEqual({ page: "agent", sub: "ads" });
  });

  it("sends an unknown or missing agent to the Manager", () => {
    expect(resolveClientPage(linked, "agent", "nope")).toEqual({ page: "agent", sub: "manager" });
    expect(resolveClientPage(bare, "agent", null)).toEqual({ page: "agent", sub: "manager" });
  });
});

describe("clientPath / parseClientPath", () => {
  it("builds addresses with and without a sub-page", () => {
    expect(clientPath("t1", "management")).toBe("/admin/client/t1/management");
    expect(clientPath("t1", "paid-ads", "leads")).toBe("/admin/client/t1/paid-ads/leads");
  });

  it("round-trips", () => {
    expect(parseClientPath("/admin/client/t1/paid-ads/leads")).toEqual({
      tenantId: "t1",
      page: "paid-ads",
      sub: "leads",
    });
    expect(parseClientPath("/admin/client/t1/brief")).toEqual({
      tenantId: "t1",
      page: "brief",
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
    expect(resolveClientPage(linked, "management", "x")).toEqual({ page: "management", sub: null });
  });

  it("sends every retired setup page to Brief", () => {
    for (const old of ["onboarding", "setter", "full-setup", "onboarding-call", "launch-call", "accounts", "info", "software"]) {
      expect(resolveClientPage(linked, old, null)).toEqual({ page: "brief", sub: null });
      expect(resolveClientPage(bare, old, "x")).toEqual({ page: "brief", sub: null });
    }
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

  it("carries a retired page across as Brief", () => {
    expect(switchTarget({ page: "accounts", sub: null }, { id: "t2", ...linked })).toBe("/admin/client/t2/brief");
  });

  it("from agency, opens setup clients on Brief and live ones on Paid Ads", () => {
    expect(switchTarget(null, { id: "t2", ...bare })).toBe("/admin/client/t2/brief");
    expect(switchTarget(null, { id: "t2", ...linked })).toBe("/admin/client/t2/paid-ads/dashboard");
  });
});

describe("legacyClientPath", () => {
  it("maps old Fulfillment pages", () => {
    expect(legacyClientPath("software", null, "t1")).toBe("/admin/client/t1/brief");
    expect(legacyClientPath("paid-ads", "leads", "t1")).toBe("/admin/client/t1/paid-ads/leads");
    expect(legacyClientPath("ghl", "calendars", "t1")).toBe("/admin/client/t1/ghl/calendars");
  });

  it("maps retired cockpit tabs", () => {
    expect(legacyClientPath("billing", null, "t1")).toBe("/admin/client/t1/management");
    expect(legacyClientPath("config", null, "t1")).toBe("/admin/client/t1/management");
    expect(legacyClientPath("overview", null, "t1")).toBe("/admin/client/t1/brief");
  });

  it("maps onboarding and unknown pages", () => {
    expect(legacyClientPath("onboarding", null, "t1")).toBe("/admin/client/t1/brief");
    expect(legacyClientPath("setter", null, "t1")).toBe("/admin/client/t1/brief");
    expect(legacyClientPath(null, null, "t1")).toBe("/admin/client/t1/brief");
    expect(legacyClientPath("nonsense", "x", "t1")).toBe("/admin/client/t1/brief");
  });
});
