// ===========================================================================
// Paid Ads (Sales) — the paid-ad lead worklist, DEMO DATA + real pipeline map.
//
// This is the "Paid Ads" Sales surface (`/sales/paid-ads`): the only channel
// that qualifies cold traffic with an intro call before it enters the Sales
// spine. It reads the GoHighLevel "Paid Ad's Pipeline" (id below) and works
// each lead toward a confirmed intro call, then hands off to the Intro Calls
// page (Sales Pipeline @ Intro Call Confirmed).
//
// The STAGES here are the REAL GoHighLevel Paid Ad's Pipeline stages (pulled
// live from client #1, Willis Windows — identical template for every client),
// not invented buckets. `ghlName` is the exact stage name; `short`/`label` are
// the friendly display. When the live feed lands (GHL opportunities in pipeline
// `PAID_ADS_PIPELINE_ID`), replace `DEMO_LEADS` with a fetch and map each
// opportunity's `pipelineStageId` to a StageKey; the UI reads only these types.
// ===========================================================================

import type { Tone } from "./status";
import type { ApiLead } from "./api";
import { timeAgo } from "./timeAgo";

// GoHighLevel pipeline this surface reads (same template across all clients).
export const PAID_ADS_PIPELINE_ID = "uz0fFxCgiwdXbg4Zmwkc";

// Every stage of the Paid Ad's Pipeline, in GHL order. `kind` splits the active
// spine (a lead progressing toward a booked job) from the off-ramps (parked /
// dead-end). `step` places an active stage on the 5-tier journey bar.
export type StageKey =
  | "lead_in"
  | "lead_in_no_appt"
  | "lead_responded"
  | "no_answer"
  | "not_qualified"
  | "intro_call_waiting"
  | "intro_call_no_confirm"
  | "estimate_scheduled"
  | "apt_completed"
  | "followup_not_ready";

export interface StageMeta {
  // Exact GoHighLevel stage name (shown verbatim in the lead detail).
  ghlName: string;
  // Full friendly label for the detail badge.
  label: string;
  // Short label for the inbox pill / chips.
  short: string;
  tone: Tone;
  kind: "active" | "offramp";
  // 1-based position on the journey bar (active stages only).
  step?: number;
}

// How many tiers the active journey bar has (Lead → Responded → Awaiting
// confirm → Estimate → Quote). Off-ramps light the first segment in danger.
export const JOURNEY_STEPS = 5;

export const STAGE_META: Record<StageKey, StageMeta> = {
  lead_in: {
    ghlName: "Lead In",
    label: "New lead",
    short: "New",
    tone: "brand",
    kind: "active",
    step: 1,
  },
  lead_in_no_appt: {
    ghlName: "Lead In No Appointment Booked",
    label: "New · no appointment booked",
    short: "No appt yet",
    tone: "brand",
    kind: "active",
    step: 1,
  },
  lead_responded: {
    ghlName: "Lead Responded",
    label: "Responded",
    short: "Responded",
    tone: "brand",
    kind: "active",
    step: 2,
  },
  intro_call_waiting: {
    ghlName: "Intro Call Waiting Confirmation",
    label: "Intro call · awaiting confirmation",
    short: "Awaiting confirm",
    tone: "warning",
    kind: "active",
    step: 3,
  },
  estimate_scheduled: {
    ghlName: "Estimate Scheduled",
    label: "Estimate scheduled",
    short: "Estimate set",
    tone: "brand",
    kind: "active",
    step: 4,
  },
  apt_completed: {
    ghlName: "Apt Completed / Quote Given",
    label: "Appointment completed · quote given",
    short: "Quote given",
    tone: "positive",
    kind: "active",
    step: 5,
  },
  no_answer: {
    ghlName: "No answer",
    label: "No answer",
    short: "No answer",
    tone: "danger",
    kind: "offramp",
  },
  not_qualified: {
    ghlName: "Not Qualified",
    label: "Not qualified",
    short: "Not qualified",
    tone: "danger",
    kind: "offramp",
  },
  intro_call_no_confirm: {
    ghlName: "Intro Call No Confirmation",
    label: "Intro call · never confirmed",
    short: "No confirmation",
    tone: "danger",
    kind: "offramp",
  },
  followup_not_ready: {
    ghlName: "Followup - Not ready",
    label: "Follow up · not ready",
    short: "Follow up",
    tone: "warning",
    kind: "offramp",
  },
};

// The filter chips / funnel groups. Active groups are shown in journey order,
// then a single "Parked" group folds in every off-ramp stage. Each group keeps
// its real member stages so a lead's exact GHL stage is never lost.
export interface FilterGroup {
  key: string;
  label: string;
  tone: Tone;
  stages: StageKey[];
}

export const FILTER_GROUPS: FilterGroup[] = [
  { key: "new", label: "New", tone: "brand", stages: ["lead_in", "lead_in_no_appt"] },
  { key: "responded", label: "Responded", tone: "brand", stages: ["lead_responded"] },
  { key: "awaiting", label: "Call booked", tone: "warning", stages: ["intro_call_waiting"] },
  { key: "estimate", label: "Estimate", tone: "brand", stages: ["estimate_scheduled"] },
  { key: "quote", label: "Quote given", tone: "positive", stages: ["apt_completed"] },
  {
    key: "parked",
    label: "Parked",
    tone: "danger",
    stages: ["no_answer", "not_qualified", "intro_call_no_confirm", "followup_not_ready"],
  },
];

export type Platform = "fb" | "ig";

export const PLATFORM_META: Record<Platform, { label: string; glyph: string }> = {
  fb: { label: "Facebook", glyph: "📘" },
  ig: { label: "Instagram", glyph: "📷" },
};

export interface AdMessage {
  dir: "in" | "out";
  from: string;
  body: string;
  at: string;
  auto?: boolean;
}

export interface AdLead {
  id: string;
  name: string;
  phone: string;
  location: string;
  zip: string;
  stage: StageKey;
  platform: Platform;
  // Friendly ad name (the Meta ad the lead came from).
  adName: string;
  // One-line "what they want", shown on the row.
  intent: string;
  // Short relative time for the row ("8m", "1h", "1d").
  time: string;
  // Optional stage-specific note (intro-call time, quote follow-up, etc.).
  detail?: string;
  // Quote amount once an estimate is completed (apt_completed).
  quote?: number;
  sms: AdMessage[];
}

export interface PaidAdsDataset {
  pipelineName: string;
  pipelineId: string;
  leads: AdLead[];
  demo: boolean;
}

// --- Hand-authored demo worklist --------------------------------------------
// Paid-ad leads for Willis Windows (Metro Detroit window cleaning). One lead per
// real pipeline stage so the funnel, the filters, and every stage pill have
// something to show. Newest first.

export const DEMO_LEADS: AdLead[] = [
  {
    id: "pa_marcus",
    name: "Marcus Bell",
    phone: "(248) 555-0188",
    location: "Troy",
    zip: "48084",
    stage: "lead_in",
    platform: "fb",
    adName: "$100 Off First Clean",
    intent: "Exterior windows + screens, 18 windows. Afternoons best.",
    time: "8m",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "9:14 AM",
        body: "Hi Marcus! Willis Windows here 👋 Saw you grabbed our $100-off offer. What time this week works for a quick intro call?",
      },
      {
        dir: "in",
        from: "Marcus",
        at: "9:22 AM",
        body: "Hey! Afternoons are best. Got 18 windows, exterior + screens.",
      },
    ],
  },
  {
    id: "pa_priya",
    name: "Priya Nair",
    phone: "(248) 555-0151",
    location: "Rochester Hills",
    zip: "48307",
    stage: "lead_responded",
    platform: "ig",
    adName: "Spring Clean Special",
    intent: "\"Interested — what times do you have this week?\"",
    time: "22m",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "8:40 AM",
        body: "Hi Priya! Willis Windows 👋 Thanks for your interest from our Spring special. When's a good time for a quick intro call?",
      },
      {
        dir: "in",
        from: "Priya",
        at: "9:02 AM",
        body: "Interested — what times do you have this week?",
      },
    ],
  },
  {
    id: "pa_dana",
    name: "Dana Whitfield",
    phone: "(248) 555-0173",
    location: "Birmingham",
    zip: "48009",
    stage: "intro_call_waiting",
    platform: "fb",
    adName: "$100 Off First Clean",
    intent: "Intro call booked — waiting on her confirm tap.",
    time: "1h",
    detail: "Intro call · Thu 2:00 PM",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Yesterday",
        body: "Hi Dana! Confirming your intro call with Willis Windows for Thu at 2:00 PM. Reply YES to lock it in 👍",
      },
      { dir: "in", from: "Dana", at: "Yesterday", body: "Perfect, talk then." },
    ],
  },
  {
    id: "pa_greg",
    name: "Greg Olsen",
    phone: "(248) 555-0140",
    location: "Royal Oak",
    zip: "48067",
    stage: "lead_in_no_appt",
    platform: "ig",
    adName: "Free Screen Cleaning",
    intent: "Clicked the ad but never booked a time. Needs a nudge.",
    time: "2h",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "7:30 AM",
        body: "Hi Greg! Willis Windows 👋 You grabbed our free screen-cleaning offer — want to grab a quick time to chat?",
      },
    ],
  },
  {
    id: "pa_tamara",
    name: "Tamara Hayes",
    phone: "(586) 555-0166",
    location: "Sterling Heights",
    zip: "48310",
    stage: "estimate_scheduled",
    platform: "fb",
    adName: "$100 Off First Clean",
    intent: "Intro call done → in-person estimate set.",
    time: "3h",
    detail: "On-site estimate · Fri 10:00 AM",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        at: "Tue",
        body: "Great chatting, Tamara! Booked your on-site estimate for Friday at 10 AM. See you then.",
      },
      { dir: "in", from: "Tamara", at: "Tue", body: "Sounds good, thank you!" },
    ],
  },
  {
    id: "pa_sofia",
    name: "Sofia Russo",
    phone: "(248) 555-0124",
    location: "Bloomfield",
    zip: "48302",
    stage: "apt_completed",
    platform: "fb",
    adName: "$100 Off First Clean",
    intent: "Quoted at the visit. Deciding — follow up Wednesday.",
    time: "1d",
    quote: 420,
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        at: "Mon",
        body: "Thanks for having us out, Sofia! Sent over your quote of $420 for the full house, interior + exterior. Let me know any questions.",
      },
      { dir: "in", from: "Sofia", at: "Mon", body: "Thanks! Need to check with my husband, I'll get back to you." },
    ],
  },
  {
    id: "pa_victor",
    name: "Victor Cruz",
    phone: "(586) 555-0109",
    location: "Warren",
    zip: "48091",
    stage: "no_answer",
    platform: "ig",
    adName: "Spring Clean Special",
    intent: "No answer on 2 attempts · auto-retry has 2 left.",
    time: "5h",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Yesterday",
        body: "Hi Victor! Willis Windows 👋 Tried giving you a ring about your window cleaning — what time suits you for a quick call?",
      },
    ],
  },
  {
    id: "pa_brian",
    name: "Brian Kessler",
    phone: "(248) 555-0118",
    location: "Ferndale",
    zip: "48220",
    stage: "intro_call_no_confirm",
    platform: "fb",
    adName: "$100 Off First Clean",
    intent: "Intro call was booked but he never confirmed it.",
    time: "1d",
    detail: "Booked Wed 1:00 PM · never confirmed",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Wed",
        body: "Hi Brian! Just need you to confirm your intro call for Wed at 1 PM — reply YES and we're set.",
      },
    ],
  },
  {
    id: "pa_janet",
    name: "Janet Pryor",
    phone: "(248) 555-0195",
    location: "Clawson",
    zip: "48017",
    stage: "followup_not_ready",
    platform: "fb",
    adName: "Spring Clean Special",
    intent: "Interested but wants to circle back in the fall.",
    time: "2d",
    detail: "Follow up · September",
    sms: [
      {
        dir: "in",
        from: "Janet",
        at: "Sat",
        body: "Hi, love the idea but we just had them done. Maybe reach out in the fall?",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "Sat",
        body: "Absolutely, Janet! I'll check back in around September. Have a great summer 🌞",
      },
    ],
  },
  {
    id: "pa_derek",
    name: "Derek Madsen",
    phone: "(248) 555-0177",
    location: "Novi",
    zip: "48375",
    stage: "not_qualified",
    platform: "ig",
    adName: "Free Screen Cleaning",
    intent: "Out of our service area.",
    time: "2d",
    sms: [
      {
        dir: "in",
        from: "Derek",
        at: "Fri",
        body: "Do you cover Howell? Need a few windows done.",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "Fri",
        body: "Thanks Derek! Howell is just outside our service area right now, so we won't be able to help on this one.",
      },
    ],
  },
];

// --- Live GHL mapping -------------------------------------------------------
// A row from GET /api/ads/leads: an ApiLead plus the resolved GHL stage name.
export type ApiAdLead = ApiLead & { stageName?: string };

function normStage(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

// Reverse of STAGE_META: normalized GHL stage name -> StageKey, so a live
// opportunity's stage name resolves to the same key the demo data uses.
const NAME_TO_STAGE: Map<string, StageKey> = (() => {
  const m = new Map<string, StageKey>();
  for (const key of Object.keys(STAGE_META) as StageKey[]) {
    m.set(normStage(STAGE_META[key].ghlName), key);
  }
  return m;
})();

function stageKeyFromName(name: string): StageKey {
  return NAME_TO_STAGE.get(normStage(name)) ?? "lead_in";
}

// Map a live opportunity to an AdLead. Location/zip, the ad name/platform, and
// the SMS thread are not on the opportunity feed, so they take neutral defaults;
// the conversation loads on select. The stage (and thus the journey bar) is real.
function mapApiAdLead(o: ApiAdLead): AdLead {
  return {
    id: o.id,
    name: o.name,
    phone: o.phone,
    location: "",
    zip: "",
    stage: stageKeyFromName(o.stageName ?? ""),
    platform: "fb",
    adName: "Paid ad",
    intent: "",
    time: timeAgo(o.lastActivityAt),
    sms: [],
  };
}

// The dataset the page reads. Demo passes the hand-authored worklist through
// unchanged; a real session maps the live Paid Ad's Pipeline opportunities from
// GET /api/ads/leads.
export function buildPaidAdsLeads(demo: boolean, raw?: unknown[]): PaidAdsDataset {
  const rows = raw ?? [];
  return {
    pipelineName: "Paid Ad's Pipeline",
    pipelineId: PAID_ADS_PIPELINE_ID,
    leads: demo ? (rows as AdLead[]) : (rows as ApiAdLead[]).map(mapApiAdLead),
    demo,
  };
}

// Count of leads in each filter group, for the funnel summary + chip badges.
export function groupCounts(leads: AdLead[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const g of FILTER_GROUPS) counts[g.key] = 0;
  const stageToGroup = new Map<StageKey, string>();
  for (const g of FILTER_GROUPS) for (const s of g.stages) stageToGroup.set(s, g.key);
  for (const lead of leads) {
    const key = stageToGroup.get(lead.stage);
    if (key) counts[key]++;
  }
  return counts;
}
