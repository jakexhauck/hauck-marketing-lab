// Pure view helpers for the Agents page (docs/build-plans/agents.md, Task 7).
// Everything here is a function of wire data and a clock, so the page's rules
// (chat grouping, chip mapping, the online footer, poll speed, badges) are
// tested without rendering anything.

import type { AgentId } from "./agents";
import type { AgentItem, AgentMessage, ChatSummary, RunnerStatus } from "./agentWire";
import { formatBudget, isCurrencyCode } from "./metaCurrency";

export type ChatGroupLabel = "Today" | "This week" | "Earlier";

const DAY_MS = 86_400_000;

// Today starts at the viewer's local midnight; This week is the last seven
// days counted back from now, so a Monday chat does not fall off on Sunday.
export function groupChats(chats: ChatSummary[], now: Date): { label: ChatGroupLabel; chats: ChatSummary[] }[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const buckets: Record<ChatGroupLabel, ChatSummary[]> = { Today: [], "This week": [], Earlier: [] };
  const sorted = [...chats].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const c of sorted) {
    const t = Date.parse(c.updatedAt);
    if (t >= midnight) buckets.Today.push(c);
    else if (t > weekAgo) buckets["This week"].push(c);
    else buckets.Earlier.push(c);
  }
  return (["Today", "This week", "Earlier"] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, chats: buckets[label] }));
}

export interface Chip {
  kind: "used" | "learned";
  text: string;
}

// "Used from brain" chips first, then "learned" chips (the mockup's order),
// then the tool steps as their own rows.
export function messageView(msg: AgentMessage): { chips: Chip[]; tools: string[]; pending: boolean } {
  const chips: Chip[] = [
    ...msg.used.map((text) => ({ kind: "used" as const, text })),
    ...msg.learned.map((text) => ({ kind: "learned" as const, text: /^learned:/i.test(text) ? text : `Learned: ${text}` })),
  ];
  return { chips, tools: msg.tools, pending: msg.status === "queued" || msg.status === "running" };
}

// Same 90s window the status endpoint uses, re-checked against the clock here
// so a cached "online" goes stale on its own when the PC drops off.
export function onlineLabel(status: RunnerStatus | undefined, now: Date): { online: boolean; label: string } {
  const seen = status?.lastSeenAt ? Date.parse(status.lastSeenAt) : NaN;
  const online = Number.isFinite(seen) && now.getTime() - seen < 90_000;
  return { online, label: online ? "Agents online on Jake's PC" : "Agents offline" };
}

// 2s while the PC owes a reply, 15s otherwise.
export function pollMs(messages: AgentMessage[] | undefined): number {
  return messages?.some((m) => m.status === "queued" || m.status === "running") ? 2000 : 15000;
}

// The sidebar badge: items waiting on Jake's OK, per agent.
export function needsOkCounts(items: AgentItem[]): Partial<Record<AgentId, number>> {
  const out: Partial<Record<AgentId, number>> = {};
  for (const it of items) if (it.status === "needs_ok") out[it.agent] = (out[it.agent] ?? 0) + 1;
  return out;
}

// The six working agents, in rail order, for the Manager's per-client dots.
export const WORKING_AGENTS: AgentId[] = ["research", "ads", "creative", "landing", "ghl", "reporting"];

export type Dot = "d" | "w" | "s" | "";

// One row of the agency Manager's Clients tab. A dot is the agent's most
// pressing state: waiting on Jake beats building beats shipped.
export function clientRowView(items: AgentItem[]): { next: string; dots: Dot[] } {
  const waiting = items.filter((i) => i.status === "needs_ok").length;
  const building = items
    .filter((i) => i.status === "building")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const next = waiting > 0 ? `${waiting} waiting on you` : (building[0]?.title ?? "All quiet");
  const dots = WORKING_AGENTS.map((agent): Dot => {
    const mine = items.filter((i) => i.agent === agent);
    if (mine.some((i) => i.status === "needs_ok")) return "s";
    if (mine.some((i) => i.status === "building")) return "w";
    if (mine.some((i) => i.status === "live" || i.status === "done")) return "d";
    return "";
  });
  return { next, dots };
}

// "2 min ago" for the request card.
export function ago(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface ItemStep {
  label: string;
  state: "done" | "now" | "todo";
}

export interface ItemPayloadView {
  steps: ItemStep[];
  stats: { label: string; value: string }[];
  quote: string | null;
  plan: string[];
  previewUrl: string | null;
  // Set once an approved landing page is live (file-asset).
  liveUrl: string | null;
  // The card asks for a deploy: its Approve puts the page live.
  deploy: boolean;
  thumbs: string[];
  // A spend card (Creative Agent): what an Approve lets it spend, and on what.
  credits: number | null;
  what: string | null;
  // A GHL or Ads card's ops in words. An Approve allows exactly these calls
  // on the server (lib/agentGhlOps.ts, lib/agentMetaOps.ts), so the card
  // shows them, not only the plan.
  changes: ItemChange[];
}

// One line of a card's changes. `bold` is drawn strong after the text (a new
// ad's status).
export interface ItemChange {
  text: string;
  bold?: string;
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;

// Meta object kinds in words, and cents as dollars, for the Ads Agent's cards.
const META_LEVEL: Record<string, string> = { campaign: "campaign", adset: "ad set", ad: "ad" };
const budget = (v: unknown, code: unknown): string =>
  typeof v === "number" && Number.isFinite(v) ? formatBudget(v, isCurrencyCode(code) ? code : "USD") : "?";

// Where a Meta object sits, so two ads with one name read apart: the id's
// last six digits, then its ad set and campaign as the card names them.
function metaTarget(a: Record<string, unknown>): string {
  const level = META_LEVEL[String(a.level)] ?? String(a.level);
  const tail = typeof a.id === "string" ? ` (id ending ${a.id.slice(-6)})` : "";
  const adset = str(a.adsetName) ? ` in ad set "${a.adsetName}"` : "";
  const campaign = str(a.campaignName) ? ` (campaign "${a.campaignName}")` : "";
  return `${level} "${a.name}"${tail}${adset}${campaign}`;
}

// A new ad, every word Meta will publish for it, exactly as it will be
// published: Jake approves the copy, not a summary of it.
function createAdLines(a: Record<string, unknown>): ItemChange[] {
  const opt = (v: unknown) => (str(v) ? v : "none");
  const lines: ItemChange[] = [
    { text: changeLine("createAd", a) },
    { text: `Primary text: ${String(a.message ?? "")}` },
    { text: `Headline: ${opt(a.headline)}` },
    { text: `Description: ${opt(a.description)}` },
    { text: `Button: ${String(a.cta ?? "")}` },
  ];
  if (str(a.link)) lines.push({ text: `Link: ${a.link}` });
  if (str(a.leadFormId)) lines.push({ text: `Lead form: ${a.leadFormId}` });
  lines.push({ text: "Status: ", bold: a.status === "ACTIVE" ? "ACTIVE" : "PAUSED" });
  return lines;
}

function changeLine(op: string, a: Record<string, unknown>): string {
  switch (op) {
    case "pause":
      return `Pause ${metaTarget(a)}`;
    case "resume":
      return `Resume ${metaTarget(a)}`;
    case "dailyBudget": {
      const t = metaTarget(a);
      return `${t.charAt(0).toUpperCase()}${t.slice(1)} daily budget ${budget(a.from, a.currency)} to ${budget(a.to, a.currency)}`;
    }
    case "createAd":
      return `Create ad "${a.name}" in ad set "${a.adsetName}"${typeof a.adsetId === "string" ? ` (id ending ${a.adsetId.slice(-6)})` : ""} (campaign "${a.campaignName}") from ${a.videoId ? `Meta library video "${a.videoName}"` : `Creatives file "${a.fileName}"`}`;
    case "write.customValue":
      return `Set custom value "${a.key}" to "${a.value}"`;
    case "write.customField":
      return `Create custom field "${a.name}" (${a.type})`;
    case "write.tag":
      return `Tag contact ${a.contactId} with "${a.tag}"`;
    case "write.moveOpportunity":
      return `Move opportunity ${a.opportunityId} to stage ${a.stageId} in pipeline ${a.pipelineId}`;
    default:
      return `${op} ${JSON.stringify(a)}`;
  }
}

// The payload is free-form JSON from the PC, so every key is read defensively:
// a wrong shape draws nothing rather than breaking the card.
export function itemPayload(payload: Record<string, unknown>): ItemPayloadView {
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const steps = arr(payload.steps).flatMap((s): ItemStep[] => {
    if (!s || typeof s !== "object") return [];
    const { label, state } = s as { label?: unknown; state?: unknown };
    if (!str(label)) return [];
    return [{ label, state: state === "done" || state === "now" ? state : "todo" }];
  });
  const stats = arr(payload.stats).flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const { label, value } = s as { label?: unknown; value?: unknown };
    if (!str(label) || (typeof value !== "string" && typeof value !== "number")) return [];
    return [{ label, value: String(value) }];
  });
  const https = (v: unknown): string | null => (str(v) && /^https:\/\//.test(v) ? v : null);
  const previewUrl = https(payload.previewUrl);
  const grant = payload.grant as { kind?: unknown; limit?: unknown } | undefined;
  // A spend card shows the grant's limit, the number an Approve passes on,
  // and nothing the model wrote beside it.
  const limit = grant && typeof grant === "object" && grant.kind === "spend" ? grant.limit : null;
  return {
    steps,
    stats,
    quote: str(payload.quote) ? payload.quote : null,
    plan: arr(payload.plan).filter(str),
    previewUrl,
    liveUrl: https(payload.liveUrl),
    deploy: !!grant && typeof grant === "object" && grant.kind === "deploy",
    thumbs: arr(payload.thumbs).filter((t): t is string => str(t) && /^https:\/\//.test(t)),
    credits: typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0 ? limit : null,
    what: str(payload.what) ? payload.what : null,
    changes: arr(payload.ops).flatMap((o) => {
      if (!o || typeof o !== "object") return [];
      const { op, args } = o as { op?: unknown; args?: unknown };
      if (!str(op)) return [];
      const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      return op === "createAd" ? createAdLines(a) : [{ text: changeLine(op, a) }];
    }),
  };
}

export const STATUS_PILL: Record<AgentItem["status"], { label: string; tone: "wip" | "ok" | "live" | "bad" }> = {
  building: { label: "Building", tone: "wip" },
  needs_ok: { label: "Needs your OK", tone: "ok" },
  live: { label: "Live", tone: "live" },
  done: { label: "Done", tone: "live" },
  declined: { label: "Declined", tone: "bad" },
};
