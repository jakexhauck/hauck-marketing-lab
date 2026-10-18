// The Agent SOPs (Jake, 2026-10-17; docs/build-plans/agent-sops.md).
//
// One flow map per agent, drawn like the "ADS BOARD" in Spencer Pawliw's video:
// rounded pills, open-chevron arrows, labels that sit in a gap in the line.
// Steps come from the Client Setup SOP doc where it has them. Market Research,
// Reporting and Creative have no SOP section yet, so their maps are drafts for
// Jake to correct.
//
// Node kinds pick the fill: start, agent, review (an approval gate, green
// outline), jake (Jake does it himself), edit, client, done (finish or a
// handoff to another agent). Edge kinds: main (solid black), side (dashed
// maroon: edits and loop-backs), alt (solid orange: the second route).
// Ports are "side:fraction" along that side, e.g. "b:0.3".
//
// Layout: row 0 is the first half of the main line, row 2 the second half, rows
// 1 and 3 hold side doors. The row wrap uses bend "gap" so its cross leg runs
// just above the next row. Pure: the component only draws what this returns.

import type { AgentId } from "./agents";

export type NodeKind = "start" | "agent" | "review" | "jake" | "edit" | "client" | "done";
export type EdgeKind = "main" | "side" | "alt";

export interface SopNode {
  id: string;
  c: number; // column, fractional for side doors
  r: number; // row
  k: NodeKind;
  t: string;
  d?: string[];
  src?: string; // section of the Client Setup SOP
  steps?: string[];
  link?: AgentId; // a handoff box opens that agent's map
}

// [from, to, label, kind, start port, end port, bend]
export type SopEdge = [string, string, string?, EdgeKind?, string?, string?, (number | "gap")?];

export interface AgentSop {
  id: AgentId;
  name: string;
  tag: string;
  title: string;
  draft?: boolean;
  nodes: SopNode[];
  edges: SopEdge[];
}

export const KIND: Record<NodeKind, { fill: string; label: string; gate?: boolean }> = {
  start: { fill: "#e4e4e0", label: "Start" },
  agent: { fill: "#cfe0f7", label: "Agent" },
  review: { fill: "#fbe7a3", label: "Jake approves", gate: true },
  jake: { fill: "#e3daf7", label: "Jake" },
  edit: { fill: "#f8d0d4", label: "Edits" },
  client: { fill: "#fbd5ad", label: "Client" },
  done: { fill: "#cdeedb", label: "Done / handoff" },
};

export const SOP_KEY =
  "Solid arrows = the main line. Dashed = edits and loop-backs. Orange = second route. Green outline = Jake approves. Blue = agent, purple = Jake, peach = client, green = done or handoff. Dashed box = draft steps. Faded = off on the Director.";

export const AGENT_SOPS: AgentSop[] = [
  {
    id: "manager", name: "Manager", tag: "Manager · client lifecycle", title: "MANAGER · paid to live",
    nodes: [
      { id: "paid", c: 0, r: 0, k: "client", t: "invoice paid", d: ["PIF or deposit", "client made in the Tracker"], src: "Full Setup Checklist > Operations",
        steps: ["Close logged on the post-call form", "Client created in the Client Tracker", "Personal onboarding link sent"] },
      { id: "contract", c: 1, r: 0, k: "client", t: "contract signed", d: ["PDF uploaded", "terms read into Management"], src: "Full Setup Checklist > Operations",
        steps: ["Contract PDF uploaded", "Claude reads terms into Management"] },
      { id: "prep", c: 2, r: 0, k: "agent", t: "onboarding prep", d: ["Drive folder + templates", "dialing script, sub-account"], src: "Onboarding Call > Before The Call",
        steps: ["Make Drive folder named for the client", "Copy Client Setup templates in with proper names (Video Scripts, Copy)", "Customize dialing script", "Set up the sub-account (GHL Agent)"] },
      { id: "call", c: 3, r: 0, k: "jake", t: "onboarding call", d: ["BM access, assets", "expectations set"], src: "Onboarding Call > Todo",
        steps: ["Access Business Manager", "Log into the software and explain it", "Set expectations: first lead in 2 to 3 days, quality starts worst and improves", "Get marketing assets", "Dialing script if needed"] },
      { id: "build", c: 0, r: 2, k: "agent", t: "build", d: ["4 agents in parallel", "each runs its own map"], src: "Full Setup Checklist",
        steps: ["GHL Agent: sub-account, phone, workflows, CAPI", "Ads Agent: lead form and campaign plan", "Creative Agent: images and videos", "Landing Page Agent: conversion assets"] },
      { id: "check", c: 1, r: 2, k: "review", t: "pre-launch check", d: ["follow ups, CAPI, campaign", "Accounts page all green"], src: "Launch Call > Before The Call",
        steps: ["Follow ups built", "Appointment automations built", "CAPI firing", "Campaign, ad set, creatives, copy, lead form ready", "Software account fully done", "Accounts page all green"] },
      { id: "launch", c: 2, r: 2, k: "jake", t: "launch call", d: ["creatives, copy, form", "test SMS"], src: "Launch Call > Todo",
        steps: ["Go over creatives", "Go over copy and headlines", "Go over the lead form", "Go over GHL automations", "Explain the software", "Send test SMS, client saves both outcome numbers"] },
      { id: "live", c: 3, r: 2, k: "done", t: "ads LIVE", d: ["Ads Agent monitors", "Reporting starts"], src: "Full Setup Checklist > Facebook Ads",
        steps: ["Ads Agent starts daily monitoring", "Reporting Agent starts the monthly cycle"] },
      { id: "fix", c: 1.4, r: 1, k: "edit", t: "fix list", d: ["side door", "sent to the owning agent"], src: "Launch Call > Before The Call",
        steps: ["Each failed check becomes a request to the agent that owns it", "Re-check when every request is closed"] },
      { id: "ghl", c: 0, r: 3, k: "done", t: "GHL Agent", d: ["sub-account to CAPI"], link: "ghl" },
      { id: "ads", c: 1, r: 3, k: "done", t: "Ads Agent", d: ["form + campaign plan"], link: "ads" },
      { id: "cre", c: 2, r: 3, k: "done", t: "Creative Agent", d: ["images + videos"], link: "creative" },
      { id: "lp", c: 3, r: 3, k: "done", t: "Landing Page Agent", d: ["conversion assets"], link: "landing" },
    ],
    edges: [
      ["paid", "contract", "signed"], ["contract", "prep", "folder made"], ["prep", "call", "booked"],
      ["call", "build", "assets in", "main", "b:0.5", "t:0.3", "gap"],
      ["build", "check", "all built"], ["check", "launch", "all green"], ["launch", "live", "go live"],
      ["check", "fix", "not ready", "side", "t:0.6", "b:0.3"], ["fix", "build", "back to build", "side", "l:0.5", "t:0.75"],
      ["build", "ghl", "hands off", "alt", "b:0.2", "t:0.5"], ["build", "ads", "", "alt", "b:0.2", "t:0.5"],
      ["build", "cre", "", "alt", "b:0.2", "t:0.5"], ["build", "lp", "", "alt", "b:0.2", "t:0.5"],
    ],
  },
  {
    id: "ghl", name: "GHL", tag: "GHL Agent · proposed flow", title: "GHL · sub-account to automations live",
    nodes: [
      { id: "sub", c: 0, r: 0, k: "start", t: "sub-account", d: ["New Client snapshot", "media uploaded"], src: "GHL Setup",
        steps: ["Create the new sub-account", "Add the New Client snapshot", "Upload media into the Media Library"] },
      { id: "staff", c: 1, r: 0, k: "agent", t: "staff added", d: ["Jake + client", "email from onboarding form"], src: "GHL Setup",
        steps: ["Add Jake as staff", "Add the client as staff (email from the onboarding form)"] },
      { id: "fb", c: 2, r: 0, k: "jake", t: "connect facebook", d: ["pages + Instagram", "needs Jake's login"], src: "GHL Setup",
        steps: ["Connect the client's Facebook and Instagram pages", "Needs Jake's login, the agent cannot do this"] },
      { id: "cv", c: 3, r: 0, k: "agent", t: "custom values", d: ["API token, company, owner", "from email + name"], src: "2. Custom Values",
        steps: ["Location API token (Private Integrations, full access)", "Company name, company phone (local GHL number)", "User first name, user full name", "From email / name, internal notification email, name, SMS"] },
      { id: "a2p", c: 4, r: 0, k: "agent", t: "A2P submitted", d: ["A2P Wizard, low volume", "passes the AI check"], src: "1. A2P & Phone System",
        steps: ["Fill the A2P Wizard form from the onboarding form", "Business profile emails from the wizard site", "Trust Center > A2P Messaging > Start Registration", "Low volume, manual setup, Local on the wizard", "Tick every Business Website Compliance box", "Pass the AI check, then submit"] },
      { id: "phone", c: 0, r: 2, k: "agent", t: "phone system", d: ["local number, recording", "routes to the owner"], src: "1. A2P & Phone System",
        steps: ["Buy a local number on the client's area code", "Turn off message compliance (all 3 boxes, type CONFIRM)", "Turn on call recording and transcription", "Route calls to the owner's phone"] },
      { id: "wf", c: 1, r: 2, k: "agent", t: "workflows", d: ["LF FU's, LTN", "appointment reminders"], src: "3. Workflows",
        steps: ["Lead Form FU's: Meta attribution fields, tags, notifications, New Lead opp, SMS sequence", "Working hours branch (8 AM to 8 PM)", "Recent Work, Owner Story, SMS 3, Hail Mary", "Long Term Nurture: 4 texts at 10/14/10/15 days, written for the niche", "Phone appointment, estimate and job reminders"] },
      { id: "capi", c: 2, r: 2, k: "agent", t: "CAPI workflows", d: ["Leads + Schedules", "dataset from Ads Agent"], src: "CAPI Setup",
        steps: ["Conversions API (Leads): lead form trigger, Lead event", "Conversions API (Schedules): Home Estimate booked, Schedule event", "Dataset ID and token from the Ads Agent"] },
      { id: "review", c: 3, r: 2, k: "review", t: "Jake review", d: ["every SMS read", "custom values check"], src: "Launch Call",
        steps: ["Read every SMS against the custom values", "No text that assumes an address we never asked for"] },
      { id: "done", c: 4, r: 2, k: "done", t: "back to Manager", d: ["pre-launch check"], link: "manager" },
      { id: "a2pfix", c: 3.3, r: 1, k: "edit", t: "A2P rejected", d: ["side door", "fix + resubmit"], src: "1. A2P & Phone System",
        steps: ["Read the rejection reason", "Fix on the wizard site or the form", "Resubmit"] },
      { id: "wfedit", c: 3.4, r: 3, k: "edit", t: "needs edits", d: ["side door", "back to review"], src: "3. Workflows", steps: ["Apply Jake's notes", "Back to review"] },
      { id: "fromads", c: 2, r: 1, k: "done", t: "Ads Agent", d: ["dataset ID + token"], link: "ads" },
    ],
    edges: [
      ["sub", "staff", "snapshot in"], ["staff", "fb", "invited"], ["fb", "cv", "connected"], ["cv", "a2p", "values set"],
      ["a2p", "phone", "approved", "main", "b:0.9", "t:0.3", "gap"],
      ["phone", "wf", "number live"], ["wf", "capi", "built"], ["capi", "review", "firing"], ["review", "done", "approved"],
      ["a2p", "a2pfix", "rejected", "side", "b:0.3", "t:0.5"], ["a2pfix", "a2p", "resubmit", "side", "r:0.5", "b:0.6"],
      ["review", "wfedit", "changes", "side", "b:0.6", "t:0.5"], ["wfedit", "review", "fixed", "side", "l:0.5", "b:0.2"],
      ["fromads", "capi", "dataset ID + token", "alt", "b:0.5", "t:0.5"],
    ],
  },
  {
    id: "ads", name: "Ads", tag: "Ads Agent · proposed flow", title: "ADS · lead form to live campaign",
    nodes: [
      { id: "angles", c: 0, r: 0, k: "done", t: "research in", d: ["angles + pain points", "from Market Research"], link: "research" },
      { id: "dataset", c: 1, r: 0, k: "jake", t: "dataset + pixel", d: ["Business Suite", "system user assigned"], src: "CAPI Setup",
        steps: ["Business Suite > Data Sources > Datasets & Pixels > Add", "Assign Daniel Hauck and the Conversions API system user, full access", "Events Manager: set up Conversions API with Meta", "Copy dataset ID and access token"] },
      { id: "form", c: 2, r: 0, k: "agent", t: "lead form draft", d: ["homeowner + how soon", "end pages, privacy"], src: "2. Lead Form Creation",
        steps: ["Name: Company Name | OG Form, More Volume", "Headline: Answer X quick questions for your free estimate", "3 checkmark lines written for the niche", "Q1 homeowner (no closes form), Q2 how soon (30+ days closes form)", "Full name + phone, client's privacy policy", "End page for leads (call GHL number) and non-leads"] },
      { id: "plan", c: 3, r: 0, k: "agent", t: "campaign plan", d: ["CBO, zips (max 20)", "placements + UTM"], src: "3. Campaign Creation",
        steps: ["Leads objective, CBO, name LF | DATE | CBO", "Instant Forms, max leads, start next day midnight", "Zip codes from the onboarding form (max 20), 18 to 65+", "Feeds, stories, reels on FB + IG only", "1:1 and 4:5 creatives, enhancements off", "UTM string on every ad"] },
      { id: "copy", c: 4, r: 0, k: "agent", t: "ad copy", d: ["primary text + headlines", "client voice from vault"], src: "3. Campaign Creation",
        steps: ["Write in the client's voice from the vault", "One version per creative angle"] },
      { id: "review", c: 0, r: 2, k: "review", t: "Jake review", d: ["form, plan, copy"], steps: ["Approve form, plan and copy"] },
      { id: "build", c: 1, r: 2, k: "jake", t: "build in Ads Manager", d: ["agent is read-only", "Jake publishes"], src: "3. Campaign Creation",
        steps: ["Create the instant form from the draft", "Media Library folder: Images + Videos", "Create campaign, ad set, ads", "Publish"] },
      { id: "monitor", c: 2, r: 2, k: "agent", t: "monitor", d: ["daily, read-only", "CPL + GHL outcomes"], steps: ["Pull spend, CPL, leads per ad", "Match leads to GHL outcomes"] },
      { id: "rec", c: 3, r: 2, k: "agent", t: "recommend", d: ["kill / watch", "scale / refresh"], steps: ["Card in chat with the numbers behind it", "Jake makes the change in Ads Manager"] },
      { id: "edits", c: 0.4, r: 3, k: "edit", t: "needs edits", d: ["side door", "back to review"], steps: ["Apply Jake's notes", "Back to review"] },
      { id: "toghl", c: 1, r: 1, k: "done", t: "GHL Agent", d: ["gets dataset ID + token"], link: "ghl" },
      { id: "tocre", c: 3.4, r: 3, k: "done", t: "Creative Agent", d: ["refresh request"], link: "creative" },
    ],
    edges: [
      ["angles", "dataset", "brief in"], ["dataset", "form", "dataset made"], ["form", "plan", "drafted"], ["plan", "copy", "planned"],
      ["copy", "review", "written", "main", "b:0.5", "t:0.3", "gap"],
      ["review", "build", "approved"], ["build", "monitor", "published"], ["monitor", "rec", "daily"],
      ["review", "edits", "changes", "side", "b:0.6", "t:0.5"], ["edits", "review", "fixed", "side", "l:0.5", "b:0.2"],
      ["dataset", "toghl", "dataset ID + token", "alt", "b:0.5", "t:0.5"], ["rec", "tocre", "refresh", "alt", "b:0.75", "t:0.5"],
      ["rec", "monitor", "keep watching", "side", "b:0.25", "b:0.5"],
    ],
  },
  {
    id: "creative", name: "Creative", tag: "Creative Agent · draft flow", title: "CREATIVE · idea to Media Library", draft: true,
    nodes: [
      { id: "idea", c: 0, r: 0, k: "start", t: "new ad idea", d: ["from the Ads Agent", "angle picked"], link: "ads" },
      { id: "brief", c: 1, r: 0, k: "agent", t: "brief", d: ["hook, format, sizes", "brand from the vault"], steps: ["Angle, hook, format, sizes", "Client brand from the vault"] },
      { id: "breview", c: 2, r: 0, k: "review", t: "brief review", d: ["Jake reads the brief"] },
      { id: "cost", c: 3, r: 0, k: "review", t: "credit approval", d: ["paid tools only", "nothing runs before OK"], steps: ["Card shows the credit cost", "Nothing generates until Jake approves"] },
      { id: "make", c: 4, r: 0, k: "agent", t: "generate / edit", d: ["Higgsfield images", "HyperFrames video"], steps: ["Images in Higgsfield", "Video in HyperFrames on the PC"] },
      { id: "foot", c: 0, r: 2, k: "client", t: "raw footage", d: ["owner films on phone", "lands in Drive"], steps: ["Client films on their phone", "Lands in the Drive footage folder"] },
      { id: "cut", c: 1, r: 2, k: "agent", t: "transcribe + cut", d: ["jump cuts over 0.45s", "low-res preview"], steps: ["Proxy, transcribe, frame grabs", "Cut pauses over 0.45s", "Low-res preview render"] },
      { id: "preview", c: 2, r: 2, k: "review", t: "preview review", d: ["Jake watches the cut"] },
      { id: "final", c: 3, r: 2, k: "agent", t: "final export", d: ["1:1 + 4:5", "size in the file name"], steps: ["1:1 and 4:5", "Size in the file name (x 1:1.jpg)"] },
      { id: "lib", c: 4, r: 2, k: "done", t: "Media Library", d: ["Creatives page", "Images / Videos folders"], src: "3. Campaign Creation",
        steps: ["Into the client's Creatives page", "Media Library folder: client name > Images / Videos"] },
      { id: "bedit", c: 2.4, r: 1, k: "edit", t: "brief edits", d: ["side door", "back to brief review"] },
      { id: "pedit", c: 2.4, r: 3, k: "edit", t: "preview edits", d: ["side door", "re-render, back to review"] },
    ],
    edges: [
      ["idea", "brief", "picked"], ["brief", "breview", "brief written"], ["breview", "cost", "approved"], ["cost", "make", "credits OK"],
      ["make", "preview", "rendered", "main", "b:0.9", "t:0.6", "gap"],
      ["preview", "final", "approved"], ["final", "lib", "exported"],
      ["breview", "bedit", "changes", "side", "b:0.6", "t:0.5"], ["bedit", "breview", "", "side", "l:0.5", "b:0.2"],
      ["preview", "pedit", "changes", "side", "b:0.6", "t:0.5"], ["pedit", "preview", "", "side", "l:0.5", "b:0.2"],
      ["idea", "foot", "video ad, skips the brief", "alt", "b:0.5", "t:0.5"], ["foot", "cut", "footage in", "alt"], ["cut", "preview", "preview ready", "alt"],
    ],
  },
  {
    id: "landing", name: "Landing Page", tag: "Landing Page Agent · proposed flow", title: "LANDING PAGE · assets into the follow ups",
    nodes: [
      { id: "brief", c: 0, r: 0, k: "start", t: "asset brief", d: ["Conversion Assets screen"] },
      { id: "rw", c: 1, r: 0, k: "agent", t: "recent work page", d: ["job photos + reviews"] },
      { id: "os", c: 2, r: 0, k: "agent", t: "owner story page", d: ["owner photo + story"] },
      { id: "prev", c: 3, r: 0, k: "agent", t: "preview URL", d: ["real page, own link"] },
      { id: "review", c: 0, r: 2, k: "review", t: "Jake review", d: ["on the real page"] },
      { id: "live", c: 1, r: 2, k: "agent", t: "promote to live", d: ["Cloudflare Pages"] },
      { id: "embed", c: 2, r: 2, k: "done", t: "GHL Agent", d: ["embed in the funnel"], link: "ghl", src: "Full Setup Checklist > GHL",
        steps: ["Conversion assets created and placed into the funnel"] },
      { id: "sms", c: 3, r: 2, k: "done", t: "in follow-up texts", d: ["Recent Work SMS", "Owner Story SMS"], src: "Lead Form FU's",
        steps: ["SMS: Recent Work", "Wait 24 hours", "SMS: Owner Story"] },
      { id: "edits", c: 0.4, r: 3, k: "edit", t: "needs edits", d: ["side door", "back to review"] },
    ],
    edges: [
      ["brief", "rw", "brief in"], ["rw", "os", "built"], ["os", "prev", "built"],
      ["prev", "review", "deployed", "main", "b:0.5", "t:0.3", "gap"],
      ["review", "live", "approved"], ["live", "embed", "live URL"], ["embed", "sms", "embedded"],
      ["review", "edits", "changes", "side", "b:0.6", "t:0.5"], ["edits", "review", "fixed", "side", "l:0.5", "b:0.2"],
    ],
  },
  {
    id: "research", name: "Market Research", tag: "Market Research Agent · draft flow", title: "MARKET RESEARCH · new client research", draft: true,
    nodes: [
      { id: "form", c: 0, r: 0, k: "client", t: "onboarding form", d: ["service area, offer"] },
      { id: "pain", c: 1, r: 0, k: "agent", t: "pain points", d: ["reviews, forums, Reddit"] },
      { id: "comp", c: 2, r: 0, k: "agent", t: "local competitors", d: ["their ads + offers"] },
      { id: "angles", c: 3, r: 0, k: "agent", t: "angles", d: ["TOF / MOF / BOF"] },
      { id: "review", c: 0, r: 2, k: "review", t: "Jake review" },
      { id: "brain", c: 1, r: 2, k: "agent", t: "into client brain", d: ["vault note"] },
      { id: "ads", c: 2, r: 2, k: "done", t: "Ads + Creative", d: ["angles handed off"], link: "ads" },
      { id: "edits", c: 0.4, r: 3, k: "edit", t: "needs edits", d: ["side door", "back to review"] },
    ],
    edges: [
      ["form", "pain", "form in"], ["pain", "comp", "found"], ["comp", "angles", "scanned"],
      ["angles", "review", "written", "main", "b:0.5", "t:0.3", "gap"],
      ["review", "brain", "approved"], ["brain", "ads", "saved"],
      ["review", "edits", "changes", "side", "b:0.6", "t:0.5"], ["edits", "review", "fixed", "side", "l:0.5", "b:0.2"],
    ],
  },
  {
    id: "reporting", name: "Reporting", tag: "Reporting Agent · draft flow", title: "REPORTING · monthly client report", draft: true,
    nodes: [
      { id: "close", c: 0, r: 0, k: "start", t: "month closes", d: ["1st of the month"] },
      { id: "pull", c: 1, r: 0, k: "agent", t: "pull numbers", d: ["Meta + GHL, read-only"] },
      { id: "why", c: 2, r: 0, k: "agent", t: "explain the why", d: ["from other agents' work"] },
      { id: "write", c: 3, r: 0, k: "agent", t: "write report", d: ["plain English"] },
      { id: "review", c: 0, r: 2, k: "review", t: "Jake review" },
      { id: "send", c: 1, r: 2, k: "done", t: "sent to client", d: ["Drive + email"] },
      { id: "edits", c: 0.4, r: 3, k: "edit", t: "needs edits", d: ["side door", "back to review"] },
    ],
    edges: [
      ["close", "pull", "month end"], ["pull", "why", "pulled"], ["why", "write", "explained"],
      ["write", "review", "written", "main", "b:0.5", "t:0.3", "gap"],
      ["review", "send", "approved"],
      ["review", "edits", "changes", "side", "b:0.6", "t:0.5"], ["edits", "review", "fixed", "side", "l:0.5", "b:0.2"],
    ],
  },
];

export function getAgentSop(id: string | undefined): AgentSop | null {
  return AGENT_SOPS.find((a) => a.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const NODE_W = 192;
export const NODE_H = 104;
const CW = 270;
const RH = 165;
const LEFT = 50;
const TOP = 104;

export interface Box { x: number; y: number; w: number; h: number }
type Side = "l" | "r" | "t" | "b";
export interface Port { x: number; y: number; s: Side }
interface Pt { x: number; y: number }

export function nodeBox(n: SopNode): Box {
  return { x: LEFT + n.c * CW, y: TOP + n.r * RH, w: NODE_W, h: NODE_H };
}

export function frameSize(map: AgentSop): { w: number; h: number } {
  const maxX = Math.max(...map.nodes.map((n) => nodeBox(n).x + NODE_W));
  const maxY = Math.max(...map.nodes.map((n) => nodeBox(n).y + NODE_H));
  return { w: Math.max(maxX + LEFT, 1100), h: maxY + 56 };
}

export function port(n: SopNode, spec: string): Port {
  const p = nodeBox(n);
  const [side, f] = spec.split(":");
  const t = f === undefined ? 0.5 : +f;
  if (side === "r") return { x: p.x + p.w, y: p.y + p.h * t, s: "r" };
  if (side === "l") return { x: p.x, y: p.y + p.h * t, s: "l" };
  if (side === "t") return { x: p.x + p.w * t, y: p.y, s: "t" };
  return { x: p.x + p.w * t, y: p.y + p.h, s: "b" };
}

// Orthogonal route between two ports. `bend` (0 to 1) places the middle leg.
export function route(a: Port, b: Port, bend: number | "gap" = 0.5): Pt[] {
  const H = (s: Side) => s === "l" || s === "r";
  const f = bend === "gap" ? 0.5 : bend;
  if (H(a.s) && H(b.s)) {
    if (Math.abs(a.y - b.y) < 1) return [a, b];
    const mx = a.x + (b.x - a.x) * f;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  if (H(a.s) && !H(b.s)) return [a, { x: b.x, y: a.y }, b];
  if (!H(a.s) && H(b.s)) return [a, { x: a.x, y: b.y }, b];
  if (a.s === b.s) {
    const y = a.s === "t" ? Math.min(a.y, b.y) - 34 : Math.max(a.y, b.y) + 34;
    return [a, { x: a.x, y }, { x: b.x, y }, b];
  }
  if (Math.abs(a.x - b.x) < 1) return [a, b];
  // "gap" is the row wrap: run the cross leg just above the next row.
  const my = bend === "gap" ? b.y - 16 : a.y + (b.y - a.y) * f;
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
}

// Polyline to a path with rounded corners, like the Figma connectors.
export function rounded(pts: Pt[], r = 14): string {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const d1 = Math.hypot(p.x - a.x, p.y - a.y), d2 = Math.hypot(b.x - p.x, b.y - p.y);
    const k = Math.min(r, d1 / 2, d2 / 2);
    const s = { x: p.x + ((a.x - p.x) / d1) * k, y: p.y + ((a.y - p.y) / d1) * k };
    const e = { x: p.x + ((b.x - p.x) / d2) * k, y: p.y + ((b.y - p.y) / d2) * k };
    d += ` L${s.x},${s.y} Q${p.x},${p.y} ${e.x},${e.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x},${last.y}`;
}

export interface DrawnEdge {
  key: string;
  kind: EdgeKind;
  d: string;
  label?: { text: string; x: number; y: number };
}

export function layoutEdges(map: AgentSop): DrawnEdge[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  // Default ports: side by side on one row runs right to left edge, otherwise
  // bottom to top (or top to bottom going up).
  const fromSide = (A: SopNode, B: SopNode): [string, string] => {
    const a = nodeBox(A), b = nodeBox(B);
    if (b.x > a.x + 1 && Math.abs(a.y - b.y) < 1) return ["r:0.5", "l:0.5"];
    return b.y > a.y ? ["b:0.5", "t:0.5"] : ["t:0.5", "b:0.5"];
  };
  return map.edges.map(([ai, bi, label = "", kind = "main", ps, pe, bend], i) => {
    const A = byId.get(ai)!, B = byId.get(bi)!;
    const [dps, dpe] = fromSide(A, B);
    const pts = route(port(A, ps ?? dps), port(B, pe ?? dpe), bend);
    // Pull the end back so the open arrowhead sits just off the pill.
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const L = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
    pts[pts.length - 1] = { x: last.x - ((last.x - prev.x) / L) * 3, y: last.y - ((last.y - prev.y) / L) * 3 };
    const out: DrawnEdge = { key: `${ai}-${bi}-${i}`, kind, d: rounded(pts) };
    if (label) {
      // On the longest leg, except row wraps carry it on the drop, clear of the
      // cross leg.
      let best = 0, at = 0;
      for (let j = 0; j < pts.length - 1; j++) {
        const len = Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
        if (len > best) { best = len; at = j; }
      }
      if (bend === "gap") at = 0;
      out.label = { text: label, x: (pts[at].x + pts[at + 1].x) / 2, y: (pts[at].y + pts[at + 1].y) / 2 + 3.5 };
    }
    return out;
  });
}
