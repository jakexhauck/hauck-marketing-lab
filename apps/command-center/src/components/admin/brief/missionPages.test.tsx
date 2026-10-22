import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { emptyPage, parsePage, type AdsPage as Ads, type ResearchPage as Research } from "../../../lib/briefPages";
import type { BriefLive } from "../../../lib/agentWire";
import type { ClientTask } from "../../../lib/clientTasks";
import { AdsPage } from "./AdsPage";
import { ChecklistPage } from "./ChecklistPage";
import { ClientInfoPage } from "./ClientInfoPage";
import { GhlPage } from "./GhlPage";
import { ResearchPage } from "./ResearchPage";

// Server-render each page with real-shaped data and with nothing at all: a
// crash on an empty or partial page is the failure that would reach Jake.

const T = "11111111-1111-4111-8111-111111111111";
const html = (el: ReactElement) => renderToString(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);

const LONG = "Drafty windows cost you every month.\n\nMost homes in Troy still have their original windows, and you are paying to heat the street.";

function parsed<T>(page: "ads" | "research", raw: unknown): T {
  const r = parsePage(page, raw);
  if (!r.ok) throw new Error(r.reason);
  return r.data as T;
}

const ads = parsed<Ads>("ads", {
  campaigns: [
    {
      name: "CCW Leads Nov",
      offer: "Free in-home quote, one-day install",
      objective: "Leads",
      dailySpend: 40,
      budgetType: "CBO",
      launchDate: "2026-11-03",
      adSets: [{ name: "Broad", targeting: "25 mi of Troy", form: "Instant form" }],
      creatives: [{ type: "Static images", count: 4, note: "Real job photos" }],
      angles: [{ name: "Energy bills", pitch: "New windows pay for themselves", status: "approved" }],
      ads: [{ name: "Bay window", type: "Static", angle: "Energy bills", headline: "Cut your heating bill", primaryText: LONG, status: "needs_ok", adSet: "Broad" }],
    },
  ],
  headlines: [{ angle: "Energy bills", text: "See where your heat is going" }],
});

const research = parsed<Research>("research", {
  stats: { population: 142300, olderHomesPct: 61, competitorsOnMeta: 6, competition: "high" },
  zips: [{ zip: "48084", area: "Troy", population: 23400, medianHomeValue: 318000, ownerOccupiedPct: 71, competitors: 5 }],
  competitors: [{ name: "Window Nation", googleRating: 4.1, googleReviews: 866, metaAdsLive: 54, adLibraryUrl: "https://facebook.com/ads/library" }, { name: "Clear Choice", isClient: true }],
  websites: { clientUrl: "clearchoice.com", strong: "Real photos", gap: "One-day install" },
  painPoints: [{ title: "Install dragged on", detail: "Weeks of open walls", sharePct: 31, quote: "Nine days", sources: 40 }],
  sourcesNote: "From 2,767 reviews",
});

const live: BriefLive = {
  links: [
    { id: "drive", label: "Drive folder", url: "https://drive.google.com/x" },
    { id: "ads", label: "Ads Manager", url: null },
    { id: "ghl", label: "Sub-account", url: null },
    { id: "website", label: "Website", url: "https://clearchoice.com" },
    { id: "outcome", label: "Outcome link", url: null },
  ],
  answers: [{ heading: "Business", rows: [{ label: "Business name", value: "Clear Choice Windows" }, { label: "Password", value: "on file" }] }],
  answersError: null,
  assets: [{ name: "Logo.png", url: "https://drive.google.com/file/d/1/view", thumbUrl: null, folder: "" }],
  assetsError: null,
  ghl: {
    customValues: [{ name: "Open Lead", key: "{{custom_values.open_lead}}", value: "https://app/o/1" }, { name: "Review link", key: "{{custom_values.review_link}}", value: "" }],
    pipelines: [{ name: "Sales Pipeline", stages: ["Lead", "Estimate"] }],
    calendars: [{ name: "Home Estimate", active: true }],
    workflows: [{ name: "New lead", status: "published" }, { name: "Nurture", status: "draft" }],
  },
  ghlError: null,
};

const task = (over: Partial<ClientTask>): ClientTask => ({
  id: over.key ?? "t", key: "k", phase: "onboard", owner: "csm", name: "Task", position: 0, sopKey: null, sourceNode: null, steps: [],
  state: "todo", change: "kept", reason: null, evidence: null, note: null, doneBy: null, doneAt: null, waitsOn: [], mode: "ask", outputs: {},
  ...over,
});
const tasks = [
  task({ key: "a", name: "Drive folder made", state: "done", doneBy: "csm", doneAt: "2026-10-21T10:00:00Z" }),
  task({ key: "b", name: "Connect Facebook To GHL", phase: "ghl", owner: "jake" }),
  task({ key: "c", name: "Competitors On Meta", phase: "adsbuild", owner: "research", state: "doing" }),
];

describe("Mission Control pages render", () => {
  it("Ads: offer, structure, angles, full primary text available, headlines", () => {
    const out = html(<AdsPage tenantId={T} page={ads} sections={[]} />);
    for (const s of ["Free in-home quote", "Campaign structure", "Broad", "Energy bills", "Needs OK", "Cut your heating bill", "See where your heat is going", "$40"]) {
      expect(out).toContain(s);
    }
    expect(out).toContain("Drafty windows cost you every month.");
  });

  it("Research: market, competitors with the client marked, pain points", () => {
    const out = html(<ResearchPage tenantId={T} page={research} sections={[]} />);
    for (const s of ["142,300", "48084", "Window Nation", "Client", "Install dragged on", "31%", "From 2,767 reviews", "One-day install"]) {
      expect(out).toContain(s);
    }
  });

  it("Client Information: links, assets, answers, secrets on file", () => {
    const out = html(<ClientInfoPage tenantId={T} live={live} liveLoading={false} sections={[]} />);
    for (const s of ["Drive folder", "Not set", "Logo.png", "Clear Choice Windows", "On file"]) expect(out).toContain(s);
  });

  it("Checklist: areas, your move, working, activity", () => {
    const out = html(<ChecklistPage tenantId={T} tasks={tasks} loading={false} launchDate="2026-11-03" sections={[]} />);
    for (const s of ["Onboarding", "Market Research", "GHL", "Your move", "Working", "Activity", "Ticked", "2026-11-03"]) expect(out).toContain(s);
  });

  it("GHL: values, pipeline stages, calendars, automations live and draft", () => {
    const out = html(<GhlPage tenantId={T} live={live} liveLoading={false} tasks={tasks} sections={[]} />);
    for (const s of ["{{custom_values.open_lead}}", "Empty", "Sales Pipeline", "Estimate", "Home Estimate", "New lead", "Draft", "Your move"]) {
      expect(out).toContain(s);
    }
  });

  it("every page survives having nothing", () => {
    expect(html(<AdsPage tenantId={T} page={emptyPage("ads")} sections={[]} />)).toContain("No ads planned yet");
    expect(html(<ResearchPage tenantId={T} page={emptyPage("research")} sections={[]} />)).toContain("No research yet");
    expect(html(<ClientInfoPage tenantId={T} live={undefined} liveLoading={false} sections={[]} />)).toContain("No onboarding form yet");
    expect(html(<ChecklistPage tenantId={T} tasks={[]} loading={false} launchDate="" sections={[]} />)).toContain("No setup tasks yet");
    const noGhl = html(<GhlPage tenantId={T} live={{ ...live, ghl: null, ghlError: "ghl_not_connected" }} liveLoading={false} tasks={[]} sections={[]} />);
    expect(noGhl).toContain("Not connected: ghl_not_connected");
    expect(noGhl).not.toContain(">Connected<");
  });
});
