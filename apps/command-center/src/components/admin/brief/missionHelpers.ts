// Pure helpers for the Mission Control brief (docs/build-plans/mission-control-brief.md).

import { CHECKLIST_AREAS, taskArea, type AdsPage, type ChecklistArea, type ItemStatus } from "../../../lib/briefPages";
import { taskPhases, type ClientTask } from "../../../lib/clientTasks";

export type MissionPageId = "client" | "checklist" | "research" | "ads" | "ghl";

export const MISSION_PAGES: { id: MissionPageId; label: string }[] = [
  { id: "client", label: "Client Information" },
  { id: "checklist", label: "Full Setup Checklist" },
  { id: "research", label: "Market Research" },
  { id: "ads", label: "Ads" },
  { id: "ghl", label: "GHL" },
];

/** The page a URL's sub segment names, else Client Information. */
export function resolveMissionPage(sub: string | null | undefined): MissionPageId {
  return MISSION_PAGES.find((p) => p.id === sub)?.id ?? "client";
}

export interface AreaGroup {
  area: ChecklistArea;
  label: string;
  tasks: ClientTask[];
  done: number;
  total: number;
}

/** The checklist by area, page order, cut tasks left out, empty areas dropped. */
export function areaGroups(tasks: ClientTask[]): AreaGroup[] {
  const live = tasks.filter((t) => t.state !== "cut");
  // The client's journey order (the SOP's phases), then each task's place.
  const order = new Map(taskPhases().map((p, i) => [p.id, i]));
  const rank = (t: ClientTask) => order.get(t.phase) ?? order.size;
  return CHECKLIST_AREAS.map(({ id, label }) => {
    const mine = live
      .filter((t) => taskArea(t) === id)
      .sort((a, b) => rank(a) - rank(b) || a.position - b.position);
    return { area: id, label, tasks: mine, done: mine.filter((t) => t.state === "done").length, total: mine.length };
  }).filter((g) => g.total > 0);
}

export interface ChecklistStats {
  done: number;
  total: number;
  agentsWorking: number;
  waitingOnJake: number;
}

export function checklistStats(tasks: ClientTask[]): ChecklistStats {
  const live = tasks.filter((t) => t.state !== "cut");
  return {
    done: live.filter((t) => t.state === "done").length,
    total: live.length,
    agentsWorking: live.filter((t) => t.state === "doing" && t.owner !== "jake" && t.owner !== "client").length,
    waitingOnJake: live.filter((t) => t.owner === "jake" && t.state !== "done").length,
  };
}

export interface AdsStats {
  dailySpend: number | null;
  adsAtLaunch: number;
  objective: string;
  launchDate: string;
}

/** The Ads page's top numbers across every campaign. */
export function adsStats(page: AdsPage): AdsStats {
  const spends = page.campaigns.map((c) => c.dailySpend).filter((n): n is number => n !== null);
  const dates = page.campaigns.map((c) => c.launchDate).filter(Boolean).sort();
  const objectives = [...new Set(page.campaigns.map((c) => c.objective).filter(Boolean))];
  return {
    dailySpend: spends.length ? spends.reduce((a, b) => a + b, 0) : null,
    adsAtLaunch: page.campaigns.reduce((n, c) => n + c.ads.filter((a) => a.status !== "not_made").length, 0),
    objective: objectives.join(", "),
    launchDate: dates[0] ?? "",
  };
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: "Draft",
  needs_ok: "Needs OK",
  approved: "Approved",
  live: "Live",
  not_made: "Not made",
};

export function statusTone(s: ItemStatus): "ok" | "wait" | "plain" | "brand" {
  if (s === "approved" || s === "live") return "ok";
  if (s === "needs_ok") return "wait";
  if (s === "not_made") return "plain";
  return "brand";
}

/** "4 min ago", "yesterday", "Oct 20"; "" without a time. */
export function ago(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return "yesterday";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const money = (n: number | null): string => (n === null ? "" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
export const count = (n: number | null): string => (n === null ? "" : n.toLocaleString("en-US"));
