// The Mission Control brief's structured pages (Jake, 2026-10-22;
// docs/build-plans/mission-control-brief.md).
//
// Market Research and Ads are typed JSON, one row per client and page, written
// whole by the owning agent with a ```page block. Whatever an agent sends goes
// through parsePage first: unknown keys dropped, strings capped, em dashes out,
// a wrong-typed number read as unknown. So a page always has every key, and the
// UI never meets "undefined". Client Information and GHL are read live, and the
// checklist is client_tasks grouped by taskArea. Pure.

import type { ClientTask } from "./clientTasks";

export type BriefPageId = "research" | "ads";
export const BRIEF_PAGE_IDS: BriefPageId[] = ["research", "ads"];

export type ItemStatus = "draft" | "needs_ok" | "approved" | "live" | "not_made";
const ITEM_STATUSES: ItemStatus[] = ["draft", "needs_ok", "approved", "live", "not_made"];

export type Competition = "low" | "medium" | "high";

export interface ResearchPage {
  stats: { population: number | null; olderHomesPct: number | null; competitorsOnMeta: number | null; competition: Competition | null };
  zips: {
    zip: string;
    area: string;
    population: number | null;
    medianHomeValue: number | null;
    ownerOccupiedPct: number | null;
    competitors: number | null;
  }[];
  competitors: {
    name: string;
    isClient: boolean;
    googleRating: number | null;
    googleReviews: number | null;
    metaAdsLive: number | null;
    runningSince: string;
    mainAngle: string;
    adLibraryUrl: string;
    websiteUrl: string;
  }[];
  websites: { clientUrl: string; strong: string; weak: string; commonOffer: string; commonPromise: string; gap: string };
  painPoints: { title: string; detail: string; sharePct: number | null; quote: string; sources: number | null }[];
  sourcesNote: string;
}

export interface AdsCampaign {
  name: string;
  offer: string;
  objective: string;
  dailySpend: number | null;
  budgetType: string;
  launchDate: string;
  adSets: { name: string; targeting: string; form: string }[];
  creatives: { type: string; count: number | null; note: string }[];
  angles: { name: string; pitch: string; status: ItemStatus }[];
  ads: { name: string; type: string; angle: string; headline: string; primaryText: string; status: ItemStatus; adSet: string }[];
}

export interface AdsPage {
  campaigns: AdsCampaign[];
  headlines: { angle: string; text: string }[];
}

export type BriefPageData = ResearchPage | AdsPage;

export interface BriefPageRow {
  page: BriefPageId;
  data: BriefPageData;
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

export function isBriefPageId(v: unknown): v is BriefPageId {
  return v === "research" || v === "ads";
}

/** The page an agent writes with its ```page block, or null for one with none. */
export function pageForAgent(agent: string): BriefPageId | null {
  return agent === "research" || agent === "ads" ? agent : null;
}

// ---- cleaning ----

const MAX_TEXT = 2000;
const MAX_PRIMARY = 5000;
const MAX_ROWS = 50;
const EM_DASH = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, "g");

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const text = (v: unknown, max = MAX_TEXT): string =>
  typeof v === "string" ? v.replace(EM_DASH, ", ").trim().slice(0, max) : typeof v === "number" ? String(v) : "";
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true;
const status = (v: unknown): ItemStatus => (ITEM_STATUSES.includes(v as ItemStatus) ? (v as ItemStatus) : "draft");
const rows = <T>(v: unknown, f: (o: Obj) => T): T[] => (Array.isArray(v) ? v.slice(0, MAX_ROWS).map((x) => f(obj(x))) : []);

function research(o: Obj): ResearchPage {
  const s = obj(o.stats);
  const w = obj(o.websites);
  const comp = s.competition;
  return {
    stats: {
      population: num(s.population),
      olderHomesPct: num(s.olderHomesPct),
      competitorsOnMeta: num(s.competitorsOnMeta),
      competition: comp === "low" || comp === "medium" || comp === "high" ? comp : null,
    },
    zips: rows(o.zips, (z) => ({
      zip: text(z.zip),
      area: text(z.area),
      population: num(z.population),
      medianHomeValue: num(z.medianHomeValue),
      ownerOccupiedPct: num(z.ownerOccupiedPct),
      competitors: num(z.competitors),
    })),
    competitors: rows(o.competitors, (c) => ({
      name: text(c.name),
      isClient: bool(c.isClient),
      googleRating: num(c.googleRating),
      googleReviews: num(c.googleReviews),
      metaAdsLive: num(c.metaAdsLive),
      runningSince: text(c.runningSince),
      mainAngle: text(c.mainAngle),
      adLibraryUrl: text(c.adLibraryUrl),
      websiteUrl: text(c.websiteUrl),
    })),
    websites: {
      clientUrl: text(w.clientUrl),
      strong: text(w.strong),
      weak: text(w.weak),
      commonOffer: text(w.commonOffer),
      commonPromise: text(w.commonPromise),
      gap: text(w.gap),
    },
    painPoints: rows(o.painPoints, (p) => ({
      title: text(p.title),
      detail: text(p.detail),
      sharePct: num(p.sharePct),
      quote: text(p.quote),
      sources: num(p.sources),
    })),
    sourcesNote: text(o.sourcesNote),
  };
}

function ads(o: Obj): AdsPage {
  return {
    campaigns: rows(o.campaigns, (c) => ({
      name: text(c.name),
      offer: text(c.offer),
      objective: text(c.objective),
      dailySpend: num(c.dailySpend),
      budgetType: text(c.budgetType),
      launchDate: text(c.launchDate),
      adSets: rows(c.adSets, (a) => ({ name: text(a.name), targeting: text(a.targeting), form: text(a.form) })),
      creatives: rows(c.creatives, (k) => ({ type: text(k.type), count: num(k.count), note: text(k.note) })),
      angles: rows(c.angles, (a) => ({ name: text(a.name), pitch: text(a.pitch), status: status(a.status) })),
      ads: rows(c.ads, (a) => ({
        name: text(a.name),
        type: text(a.type),
        angle: text(a.angle),
        headline: text(a.headline),
        primaryText: text(a.primaryText, MAX_PRIMARY),
        status: status(a.status),
        adSet: text(a.adSet),
      })),
    })),
    headlines: rows(o.headlines, (h) => ({ angle: text(h.angle), text: text(h.text) })),
  };
}

export function emptyPage(page: "research"): ResearchPage;
export function emptyPage(page: "ads"): AdsPage;
export function emptyPage(page: BriefPageId): BriefPageData;
export function emptyPage(page: BriefPageId): BriefPageData {
  return page === "research" ? research({}) : ads({});
}

/** An agent's page as stored: every key present and clean, or why it was refused. */
export function parsePage(page: BriefPageId, raw: unknown): { ok: true; data: BriefPageData } | { ok: false; reason: string } {
  if (!isObj(raw)) return { ok: false, reason: "the page must be one JSON object" };
  return { ok: true, data: page === "research" ? research(raw) : ads(raw) };
}

// ---- the checklist ----

export type ChecklistArea = "onboarding" | "onboarding-call" | "research" | "ghl" | "ads" | "prelaunch" | "launch-call" | "live";

export const CHECKLIST_AREAS: { id: ChecklistArea; label: string }[] = [
  { id: "onboarding", label: "Onboarding" },
  { id: "onboarding-call", label: "Onboarding Call" },
  { id: "research", label: "Market Research" },
  { id: "ghl", label: "GHL" },
  { id: "ads", label: "Ads" },
  { id: "prelaunch", label: "Pre-launch Check" },
  { id: "launch-call", label: "Launch Call" },
  { id: "live", label: "Live" },
];

// The SOP's phases are the client's journey; Jake reads the checklist by area
// (Jake, 2026-10-22: "sectioned off for ads, GHL, launch call, onboarding
// call"). An agent's own work goes under its area whatever the phase.
export function taskArea(t: { phase: string; owner: string }): ChecklistArea {
  if (t.owner === "research") return "research";
  if (t.owner === "ads") return "ads";
  if (t.owner === "ghl") return "ghl";
  switch (t.phase) {
    case "paid":
      return "onboarding";
    case "onboard":
      return t.owner === "csm" ? "onboarding" : "onboarding-call";
    case "ghl":
    case "follow":
      return "ghl";
    case "adsbuild":
      return "ads";
    case "check":
      return "prelaunch";
    case "launch":
      return "launch-call";
    case "live":
      return "live";
    default:
      return "onboarding";
  }
}

export interface ActivityEvent {
  key: string;
  name: string;
  who: string;
  what: "done" | "doing";
  at: string | null;
}

/** The Activity feed: tasks being worked now, then finished ones, newest first. */
export function activityFrom(tasks: ClientTask[], limit = 12): ActivityEvent[] {
  const doing = tasks
    .filter((t) => t.state === "doing")
    .map((t): ActivityEvent => ({ key: t.key, name: t.name, who: t.owner, what: "doing", at: null }));
  const done = tasks
    .filter((t) => t.state === "done" && t.doneAt)
    .sort((a, b) => Date.parse(b.doneAt!) - Date.parse(a.doneAt!))
    .map((t): ActivityEvent => ({ key: t.key, name: t.name, who: t.doneBy ?? t.owner, what: "done", at: t.doneAt }));
  return [...doing, ...done].slice(0, limit);
}
