import { describe, expect, it } from "vitest";
import { applyPageOps, briefOpLines, freshKeys, parsePageOps, type PageOp } from "./briefPageOps";
import { emptyPage, parsePage, type AdsPage, type ResearchPage } from "./briefPages";
import { freshClass } from "../components/admin/brief/missionHelpers";

function ads(raw: unknown): AdsPage {
  const r = parsePage("ads", raw);
  if (!r.ok) throw new Error(r.reason);
  return r.data as AdsPage;
}

const winter = () =>
  ads({
    campaigns: [
      {
        name: "Winter Leads",
        offer: "Free quote",
        objective: "Leads",
        dailySpend: 40,
        adSets: [{ name: "Broad", targeting: "25 mi", form: "Instant form" }],
        angles: [{ name: "Energy bills", pitch: "Pay for themselves", status: "approved" }],
        ads: [{ name: "Bay window", angle: "Energy bills", headline: "Cut your bill", status: "live", adSet: "Broad" }],
      },
    ],
  });

function ops(page: "ads" | "research", raw: unknown): PageOp[] {
  const p = parsePageOps(page, raw);
  if (!p.ok) throw new Error(p.error);
  return p.ops;
}

function applied(page: "ads" | "research", data: AdsPage | ResearchPage, raw: unknown) {
  const r = applyPageOps(page, data, ops(page, raw));
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("parsePageOps", () => {
  it("reads the four ops", () => {
    const out = ops("ads", [
      { op: "set", campaign: "Winter Leads", field: "offer", value: "Free inspection + $500 off" },
      { op: "add", kind: "angle", campaign: "Winter Leads", fields: { name: "Drafty in winter", pitch: "The cold room" } },
      { op: "update", kind: "ad", name: "Bay window", fields: { headline: "Warmer this winter" } },
      { op: "remove", kind: "headline", name: "Old line" },
    ]);
    expect(out.map((o) => o.op)).toEqual(["set", "add", "update", "remove"]);
  });

  it("refuses a bad kind, a bad field, a wrong type and an empty list", () => {
    expect(parsePageOps("ads", [{ op: "add", kind: "banner", fields: { name: "x" } }])).toMatchObject({ ok: false, error: expect.stringContaining("op 1: kind must be one of") });
    expect(parsePageOps("ads", [{ op: "add", kind: "angle", fields: { name: "x", colour: "red" } }])).toMatchObject({ ok: false, error: "op 1: unknown field colour" });
    expect(parsePageOps("ads", [{ op: "set", field: "dailySpend", value: "forty" }])).toMatchObject({ ok: false });
    expect(parsePageOps("ads", [{ op: "set", field: "status", value: "live" }])).toMatchObject({ ok: false });
    expect(parsePageOps("ads", [{ op: "add", kind: "angle", fields: { pitch: "no name" } }])).toMatchObject({ ok: false, error: "op 1: add angle needs name" });
    expect(parsePageOps("ads", [{ op: "add", kind: "headline", campaign: "Winter Leads", fields: { text: "x" } }])).toMatchObject({ ok: false });
    expect(parsePageOps("ads", [])).toMatchObject({ ok: false });
    expect(parsePageOps("ads", "add an angle")).toMatchObject({ ok: false });
    expect(parsePageOps("research", [{ op: "add", kind: "angle", fields: { name: "x" } }])).toMatchObject({ ok: false });
  });
});

describe("applyPageOps, Ads", () => {
  it("adds a campaign and fills it in one card", () => {
    const r = applied("ads", emptyPage("ads"), [
      { op: "add", kind: "campaign", fields: { name: "Spring", offer: "Free inspection", dailySpend: 60 } },
      { op: "add", kind: "adSet", campaign: "Spring", fields: { name: "Older homes", targeting: "63021 + 63011", form: "Instant form" } },
      { op: "add", kind: "creative", campaign: "Spring", fields: { type: "Static images", count: 4 } },
      { op: "add", kind: "angle", campaign: "Spring", fields: { name: "Drafty in winter", pitch: "The cold room" } },
      { op: "add", kind: "ad", campaign: "Spring", fields: { name: "Cold room", angle: "Drafty in winter", primaryText: "Long copy" } },
      { op: "add", kind: "headline", fields: { text: "Stop heating the street", angle: "Drafty in winter" } },
    ]);
    const page = r.data as AdsPage;
    const c = page.campaigns[0];
    expect(c).toMatchObject({ name: "Spring", offer: "Free inspection", dailySpend: 60 });
    expect(c.adSets).toEqual([{ name: "Older homes", targeting: "63021 + 63011", form: "Instant form" }]);
    expect(c.creatives).toEqual([{ type: "Static images", count: 4, note: "" }]);
    expect(c.angles).toEqual([{ name: "Drafty in winter", pitch: "The cold room", status: "approved" }]);
    expect(c.ads[0]).toMatchObject({ name: "Cold room", status: "approved", headline: "" });
    expect(page.headlines).toEqual([{ text: "Stop heating the street", angle: "Drafty in winter" }]);
    expect(r.summary[0]).toBe("Add campaign: Spring");
    // The result is a page as stored: it parses to itself.
    expect(parsePage("ads", page)).toEqual({ ok: true, data: page });
  });

  it("sets a field on the only campaign when none is named", () => {
    const r = applied("ads", winter(), [{ op: "set", field: "offer", value: "Free inspection + $500 off" }]);
    expect((r.data as AdsPage).campaigns[0].offer).toBe("Free inspection + $500 off");
    expect(r.summary).toEqual(["Set offer: Free inspection + $500 off"]);
  });

  it("updates by name, any case, and keeps the status", () => {
    const r = applied("ads", winter(), [{ op: "update", kind: "ad", campaign: "winter leads", name: "BAY WINDOW", fields: { headline: "Warmer this winter" } }]);
    expect((r.data as AdsPage).campaigns[0].ads[0]).toMatchObject({ name: "Bay window", headline: "Warmer this winter", status: "live" });
  });

  it("removes by name", () => {
    const r = applied("ads", winter(), [{ op: "remove", kind: "angle", name: "Energy bills" }]);
    expect((r.data as AdsPage).campaigns[0].angles).toEqual([]);
  });

  it("an unknown campaign, a missing row or a duplicate fails the whole card", () => {
    const start = winter();
    const run = (raw: unknown) => applyPageOps("ads", start, ops("ads", raw));
    expect(run([{ op: "set", campaign: "Summer", field: "offer", value: "x" }])).toEqual({ ok: false, error: "op 1: no campaign named Summer" });
    expect(run([{ op: "remove", kind: "ad", name: "Nope" }])).toEqual({ ok: false, error: "op 1: no ad named Nope" });
    expect(
      run([
        { op: "set", field: "offer", value: "changed" },
        { op: "add", kind: "angle", fields: { name: "energy bills" } },
      ]),
    ).toEqual({ ok: false, error: "op 2: angle energy bills is already there" });
    // Nothing leaked into the page that was passed in.
    expect(start.campaigns[0].offer).toBe("Free quote");
  });

  it("with two campaigns an op must name one", () => {
    const two = ads({ campaigns: [{ name: "A" }, { name: "B" }] });
    expect(applyPageOps("ads", two, ops("ads", [{ op: "set", field: "objective", value: "Leads" }]))).toEqual({ ok: false, error: "op 1: name the campaign" });
  });
});

describe("applyPageOps, Research", () => {
  it("adds, updates and removes rows and sets the website fields", () => {
    const start = parsePage("research", { competitors: [{ name: "Window Nation", googleRating: 4.1 }], painPoints: [{ title: "Drafts" }] });
    if (!start.ok) throw new Error();
    const r = applied("research", start.data, [
      { op: "add", kind: "zip", fields: { zip: "63021", area: "Ballwin", population: 31000 } },
      { op: "update", kind: "competitor", name: "window nation", fields: { metaAdsLive: 54, isClient: false } },
      { op: "add", kind: "competitor", fields: { name: "Willis Windows", isClient: true } },
      { op: "remove", kind: "painPoint", name: "Drafts" },
      { op: "set", field: "websites.gap", value: "Nobody shows a price" },
      { op: "set", field: "stats.olderHomesPct", value: 58 },
      { op: "set", field: "sourcesNote", value: "Census 2023, 212 Google reviews" },
    ]);
    const page = r.data as ResearchPage;
    expect(page.zips[0]).toMatchObject({ zip: "63021", area: "Ballwin", population: 31000 });
    expect(page.competitors).toMatchObject([
      { name: "Window Nation", googleRating: 4.1, metaAdsLive: 54, isClient: false },
      { name: "Willis Windows", isClient: true },
    ]);
    expect(page.painPoints).toEqual([]);
    expect(page.websites.gap).toBe("Nobody shows a price");
    expect(page.stats.olderHomesPct).toBe(58);
    expect(r.summary).toContain("Add ZIP: 63021");
    expect(parsePage("research", page)).toEqual({ ok: true, data: page });
  });
});

describe("briefOpLines", () => {
  it("is one short line per op", () => {
    expect(
      briefOpLines("ads", [
        { op: "add", kind: "angle", fields: { name: "Drafty in winter" } },
        { op: "set", field: "dailySpend", value: 60 },
        { op: "update", kind: "ad", name: "Bay window", fields: { headline: "x", primaryText: "y" } },
        { op: "remove", kind: "headline", name: "Old line" },
      ]),
    ).toEqual(["Add angle: Drafty in winter", "Set daily spend: $60/day", "Change ad: Bay window, headline, primaryText", "Remove headline: Old line"]);
  });

  it("is nothing for a card that does not parse or an agent with no page", () => {
    expect(briefOpLines("ads", [{ op: "nope" }])).toEqual([]);
    expect(briefOpLines(null, [{ op: "set", field: "offer", value: "x" }])).toEqual([]);
  });
});

describe("freshKeys", () => {
  it("names what an approve added or changed and nothing else", () => {
    const before = winter();
    const after = applied("ads", before, [
      { op: "set", field: "offer", value: "New offer" },
      { op: "add", kind: "angle", fields: { name: "Drafty in winter" } },
    ]).data;
    expect([...freshKeys("ads", before, after)].sort()).toEqual(["winter leads|angle|drafty in winter", "winter leads|offer"]);
    expect(freshClass(freshKeys("ads", before, after), "Winter Leads", "angle", "Drafty in winter")).toBe(" mcb-fresh");
  });
});
