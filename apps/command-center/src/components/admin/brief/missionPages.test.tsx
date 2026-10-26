import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { emptyPage, parsePage, type AdsPage as Ads, type ResearchPage as Research } from "../../../lib/briefPages";
import { AdsPage } from "./AdsPage";
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
  competitors: [{ name: "Window Nation", googleRating: 4.1, googleReviews: 866, offer: "Buy 1 get 1 40% off" }, { name: "Clear Choice", isClient: true }],
  painPoints: [{ title: "Install dragged on", reviews: 40, quotes: [{ text: "Nine days", stars: 2, from: "Window Nation" }] }],
  goals: [{ title: "Warm house", reviews: 28, quotes: [{ text: "Front room usable", stars: 5, from: "Pella" }] }],
  angles: [{ name: "Curb Appeal", reviews: 26, quotes: [{ text: "Looks brand new from the street", stars: 5, from: "Pella" }] }],
  offers: [{ offer: "$500 off 5+ windows" }],
  funnel: [{ stage: "bof", name: "$500 off 5+ windows" }, { stage: "tof", name: "Curb Appeal", quote: "Looks brand new" }],
  sourcesNote: "From 2,767 reviews",
});

describe("agent Brief pages render", () => {
  it("Ads: offer, structure, angles, full primary text available, headlines", () => {
    const out = html(<AdsPage tenantId={T} page={ads} sections={[]} />);
    for (const s of ["Free in-home quote", "Campaign structure", "Broad", "Energy bills", "Needs OK", "Cut your heating bill", "See where your heat is going", "$40"]) {
      expect(out).toContain(s);
    }
    expect(out).toContain("Drafty windows cost you every month.");
  });

  it("Research: competitors with offers, angles with their reviews, pain points first, funnel TOF to BOF", () => {
    const out = html(<ResearchPage tenantId={T} page={research} sections={[]} />);
    for (const s of ["Window Nation", "Buy 1 get 1 40% off", "Client", "Curb Appeal", "26 reviews", "Looks brand new from the street", "Install dragged on", "Nine days", "$500 off 5+ windows", "From 2,767 reviews"]) {
      expect(out).toContain(s);
    }
    // The tabs open on pain points; goals wait behind their tab.
    expect(out).not.toContain("Front room usable");
    expect(out.indexOf(">TOF<")).toBeLessThan(out.indexOf(">BOF<"));
    for (const s of ["Homes built before", "Ad Library", "Nobody says"]) expect(out).not.toContain(s);
  });

  it("Research: the tabs open on the one the last approve touched", () => {
    expect(html(<ResearchPage tenantId={T} page={research} sections={[]} fresh={new Set(["goal|warm house"])} />)).toContain("Front room usable");
  });

  it("what the last approve changed is tinted, and nothing else", () => {
    const tinted = (out: string) => (out.match(/mcb-fresh/g) ?? []).length;
    const adsOut = html(<AdsPage tenantId={T} page={ads} sections={[]} fresh={new Set(["ccw leads nov|angle|energy bills"])} />);
    expect(tinted(adsOut)).toBe(1);
    expect(tinted(html(<AdsPage tenantId={T} page={ads} sections={[]} />))).toBe(0);
    const resOut = html(<ResearchPage tenantId={T} page={research} sections={[]} fresh={new Set(["competitor|window nation", "angle|curb appeal"])} />);
    expect(tinted(resOut)).toBe(2);
  });

  it("every page survives having nothing", () => {
    expect(html(<AdsPage tenantId={T} page={emptyPage("ads")} sections={[]} />)).toContain("No ads planned yet");
    expect(html(<ResearchPage tenantId={T} page={emptyPage("research")} sections={[]} />)).toContain("No research yet");
  });
});
