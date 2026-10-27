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
  it("lists every page for a fully wired client, Brief on top", () => {
    expect(labels(linked)).toEqual([
      [null, ["Brief", "Folder", "Client Setting"]],
      ["Paid Ads", ["Dashboard", "Lead Tracker", "Meta Data", "Creatives", "Copy & Angles", "Lead Form"]],
      ["GHL", ["Business Profile", "Staff", "Custom Values", "Custom Fields", "Calendars", "Pipelines", "Media", "Workflows", "Phone Numbers"]],
      [null, ["Management", "Image Converter"]],
    ]);
  });

  it("sends the old Setting pages to the one Client Setting page", () => {
    for (const sub of ["pipeline", "script", "outcome"]) {
      expect(resolveClientPage(linked, "setting", sub)).toEqual({ page: "setting", sub: null });
    }
  });

  it("gates Paid Ads and GHL until they are connected", () => {
    expect(labels(bare)).toEqual([
      [null, ["Brief", "Folder", "Client Setting"]],
      ["Paid Ads", ["Connect ads", "Creatives", "Copy & Angles", "Lead Form"]],
      ["GHL", ["Connect GHL"]],
      [null, ["Management", "Image Converter"]],
    ]);
  });

  it("treats a blank ad account id as not linked", () => {
    const rows = clientNavGroups({ ...linked, metaAdAccountId: "  " })[1].rows;
    expect(rows[0].sub).toBe("setup");
  });

  it("puts the Client Brief at the top of the rail, as its own page", () => {
    const rows = clientNavGroups(bare)[0].rows;
    expect(rows[0]).toEqual({ page: "brief", sub: null, label: "Brief" });
    expect(clientPath("t1", "brief")).toBe("/admin/client/t1/brief");
    expect(resolveClientPage(bare, "brief", "x")).toEqual({ page: "brief", sub: null });
  });

  it("drops the old Brief pages from the address: the doc's tabs are the pages now", () => {
    for (const p of ["client", "checklist", "research", "ads", "ghl"]) {
      expect(resolveClientPage(bare, "brief", p)).toEqual({ page: "brief", sub: null });
    }
  });

  it("marks the last group with a rule instead of a caption", () => {
    const groups = clientNavGroups(linked);
    expect(groups[groups.length - 1].rule).toBe(true);
    expect(groups[0].rule).toBeFalsy();
  });

});

describe("resolveClientPage, retired Agents and Director", () => {
  it("sends every agent and the Director to Brief", () => {
    for (const [page, sub] of [["agent", "ads"], ["agent", null], ["director", null], ["director", "x"]] as const) {
      expect(resolveClientPage(linked, page, sub)).toEqual({ page: "brief", sub: null });
    }
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
    expect(resolveClientPage(linked, "ghl", null)).toEqual({ page: "ghl", sub: "business-profile" });
    expect(resolveClientPage(linked, "ghl", "conversion-assets")).toEqual({ page: "ghl", sub: "business-profile" });
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
