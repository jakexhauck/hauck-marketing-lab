// ===========================================================================
// Leads Hub — the merged "Leads" surface (Paid Ads + Estimate Forms + Chat).
//
// One client page (`/sales/leads`) with three in-line tabs, each tailored to its
// source. This replaces the three separate Sales "Channels" pages. Ships
// demo-complete but not connected: real sessions render the empty/not-connected
// state, and every terminal action is gated until the GHL feeds land.
//
// Each source runs its OWN follow-up automation (Paid Ads = SMS nurture; Estimate
// Forms = email + SMS on submit; Chat has none yet). `fu.sent` = how many steps
// have gone out, `fu.respondedAt` = the step where the lead replied (0 = no reply
// yet), `fu.outcome` = where they landed. STEP DEFINITIONS ARE PLACEHOLDERS until
// confirmed against the live GHL workflows (see docs/connections/leads.md).
// ===========================================================================

import type { ApiLead } from "./api";
import { timeAgo } from "./timeAgo";

export type LeadSource = "ad" | "form" | "chat";
export type LeadStatus = "new" | "working" | "booked" | "won" | "cold";
export type FollowUpOutcome = "replied" | "awaiting" | "noresponse" | "booked" | "won";
export type StepChannel = "sms" | "email" | "call";

export interface LeadMessage {
  dir: "in" | "out";
  from: string;
  body: string;
  at: string;
  auto?: boolean;
}

export interface FollowUp {
  // How many sequence steps have gone out (1-based count).
  sent: number;
  // The 1-based step index the lead replied at (0 = no reply yet).
  respondedAt: number;
  outcome: FollowUpOutcome;
}

export interface HubLead {
  id: string;
  name: string;
  source: LeadSource;
  status: LeadStatus;
  // GHL write targets (present on live leads, omitted on demo rows): the
  // contact for sending a reply, and the opportunity's pipeline + stage for a
  // stage move / off-ramp. The composer and NextStep actions read these.
  contactId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  // One-line "what they want".
  intent: string;
  // Last-message preview for the list row.
  preview: string;
  // Short relative time ("8m", "1h", "2d").
  when: string;
  // How long they have waited (used only while status = new).
  wait: string;
  phone: string;
  location: string;
  zip: string;
  // Friendly source line (ad name / "Website form" / "Chat widget").
  ad: string;
  // Follow-up automation state (ad + form leads; chat has none yet).
  fu?: FollowUp;
  sms: LeadMessage[];
  emails?: LeadMessage[];
}

export interface LeadsHubDataset {
  leads: HubLead[];
  demo: boolean;
}

// --- Source + status + outcome metadata ------------------------------------

export const SOURCE_META: Record<
  LeadSource,
  { label: string; short: string; accent: string }
> = {
  ad: { label: "Paid Ads", short: "Ad", accent: "#4f46e5" },
  form: { label: "Estimate Forms", short: "Form", accent: "#0f766e" },
  chat: { label: "Chat Widget", short: "Chat", accent: "#d97706" },
};

export const STATUS_META: Record<
  LeadStatus,
  { label: string; worked: boolean }
> = {
  new: { label: "New", worked: false },
  working: { label: "Working", worked: true },
  booked: { label: "Booked", worked: true },
  won: { label: "Won", worked: true },
  cold: { label: "Parked", worked: true },
};

// Outcome chip colour. Theme-aware vars where possible; booked uses a fixed sky
// so it reads distinctly from the brand indigo.
export const FU_OUTCOME: Record<FollowUpOutcome, { label: string; color: string }> = {
  replied: { label: "Replied", color: "var(--positive)" },
  awaiting: { label: "Awaiting reply", color: "var(--warning)" },
  noresponse: { label: "No response", color: "var(--faint)" },
  booked: { label: "Booked", color: "#0284c7" },
  won: { label: "Won", color: "var(--positive)" },
};

export interface FollowUpStep {
  channel: StepChannel;
  label: string;
  delay: string;
}

// The real per-source follow-up automations. PLACEHOLDER steps until confirmed
// against the live GHL workflows.
export const SEQ: Record<"ad" | "form", FollowUpStep[]> = {
  ad: [
    { channel: "sms", label: "Instant text", delay: "within 1 min" },
    { channel: "sms", label: "Follow-up 1", delay: "+1 hour" },
    { channel: "sms", label: "Follow-up 2", delay: "+1 day" },
    { channel: "sms", label: "Follow-up 3", delay: "+3 days" },
  ],
  form: [
    { channel: "email", label: "Auto-reply", delay: "instant" },
    { channel: "sms", label: "Instant text", delay: "within 1 min" },
    { channel: "sms", label: "Follow-up 1", delay: "+1 day" },
    { channel: "email", label: "Follow-up 2", delay: "+3 days" },
  ],
};

// --- Pure helpers -----------------------------------------------------------

export function isNew(l: HubLead): boolean {
  return !STATUS_META[l.status].worked;
}

export function seqFor(l: HubLead): FollowUpStep[] {
  return l.source === "ad" ? SEQ.ad : l.source === "form" ? SEQ.form : [];
}

// One-line status of what the automation is doing on its own right now.
export function automationNote(l: HubLead): string {
  if (!l.fu) return "";
  switch (l.fu.outcome) {
    case "replied":
      return "Lead replied, so the auto follow-ups paused. Your turn to reach out.";
    case "awaiting":
      return "Auto follow-ups are sending on schedule. No reply yet.";
    case "booked":
      return "Booked, so the follow-ups paused.";
    case "won":
      return "Won. The sequence is complete.";
    case "noresponse":
      return "All follow-ups sent with no reply. The sequence ended on its own.";
    default:
      return "";
  }
}

// Contextual next-step actions (shown in the Next-step popup). Ad leads are
// called or booked for an on-site visit; warm form/chat leads are called +
// quoted or booked for a visit.
export interface NextStep {
  key: string;
  title: string;
  desc: string;
  primary?: boolean;
  auto?: string;
}

export function nextSteps(source: LeadSource): NextStep[] {
  if (source === "ad") {
    return [
      { key: "call", title: "Call now", desc: "Ring them now. Opens the call console.", primary: true },
      { key: "visit", title: "Book in-person visit", desc: "Schedule an on-site estimate." },
      { key: "other", title: "Not a fit", desc: "No answer, not qualified, or park for later." },
    ];
  }
  return [
    { key: "call", title: "Call now", desc: "Ring them and quote on the phone.", primary: true },
    { key: "schedule", title: "Schedule a call", desc: "Book a time to call them back.", auto: "Pauses the follow-ups until the callback time." },
    { key: "visit", title: "Book in-person visit", desc: "Schedule an on-site estimate." },
    { key: "other", title: "Not a fit", desc: "Not qualified, out of area, or no answer." },
  ];
}

// --- Demo worklist (Willis Windows flavour) --------------------------------
// One page across all three sources. Newest first. Paid-ad + form leads carry a
// follow-up state; chat leads are a plain bucket for now.

export const DEMO_LEADS: HubLead[] = [
  {
    id: "l1", name: "Marcus Bell", source: "ad", status: "new",
    intent: "Exterior windows + screens, 18 windows",
    preview: "Hey, saw your ad. Can someone come out this week for 18 windows?",
    when: "8m", wait: "8 min", phone: "(248) 555-0188", location: "Troy", zip: "48084",
    ad: "$100 Off First Clean · Facebook",
    fu: { sent: 1, respondedAt: 1, outcome: "replied" },
    sms: [
      { dir: "out", from: "Willis Windows", auto: true, at: "8m", body: "Hi Marcus! Willis Windows here. Saw you grabbed our $100-off offer. What time this week works for a quick call?" },
      { dir: "in", from: "Marcus", at: "8m", body: "Hey, saw your ad. Can someone come out this week for 18 windows?" },
    ],
    emails: [
      { dir: "out", from: "Willis Windows", at: "8m", body: "Hi Marcus, thanks for reaching out. Happy to get you on the schedule. What's the best number to reach you?" },
    ],
  },
  {
    id: "l2", name: "Priya Nair", source: "form", status: "new",
    intent: "Full house exterior estimate",
    preview: "Filled out the form for a full-house window cleaning quote.",
    when: "22m", wait: "22 min", phone: "(248) 555-0151", location: "Rochester Hills", zip: "48307",
    ad: "Website · Estimate form",
    fu: { sent: 2, respondedAt: 2, outcome: "replied" },
    sms: [
      { dir: "in", from: "Priya", at: "22m", body: "Filled out the form for a full-house window cleaning quote." },
      { dir: "out", from: "Willis Windows", auto: true, at: "22m", body: "Thanks Priya! We'll call shortly. Is it one or two stories?" },
      { dir: "in", from: "Priya", at: "19m", body: "Two story, about 24 windows." },
    ],
    emails: [
      { dir: "in", from: "Priya Nair", at: "22m", body: "Submitted the estimate form on your site. Two-story home, interior + exterior. Prefer email during the day, thanks!" },
      { dir: "out", from: "Willis Windows", auto: true, at: "22m", body: "Thanks Priya! We received your request and will be in touch shortly to schedule a time." },
    ],
  },
  {
    id: "l3", name: "Kyle Brenner", source: "chat", status: "new",
    intent: "Screen repair + exterior clean",
    preview: "is this thing on? need a couple screens fixed and windows done",
    when: "34m", wait: "34 min", phone: "(248) 555-0155", location: "Ferndale", zip: "48220",
    ad: "Website · Chat widget",
    sms: [
      { dir: "in", from: "Kyle", at: "34m", body: "is this thing on? need a couple screens fixed and windows done" },
      { dir: "out", from: "Willis Windows", auto: true, at: "34m", body: "You're in the right place! What's the best number to reach you?" },
    ],
  },
  {
    id: "l4", name: "Aisha Rahman", source: "form", status: "new",
    intent: "Skylights + hard-water stains",
    preview: "Looking for a quote, we have skylights and some hard-water staining.",
    when: "1h", wait: "1 hr", phone: "(248) 555-0134", location: "Berkley", zip: "48072",
    ad: "Website · Estimate form",
    fu: { sent: 2, respondedAt: 0, outcome: "awaiting" },
    sms: [
      { dir: "out", from: "Willis Windows", auto: true, at: "1h", body: "Thanks Aisha! We got your request and will reach out shortly." },
      { dir: "in", from: "Aisha", at: "1h", body: "Looking for a quote, we have skylights and some hard-water staining." },
    ],
  },
  {
    id: "l5", name: "Devon Clarke", source: "ad", status: "new",
    intent: "Free screen cleaning offer",
    preview: "Auto follow-up 2 sent · no reply yet",
    when: "2h", wait: "2 hr", phone: "(248) 555-0148", location: "Royal Oak", zip: "48067",
    ad: "Free Screen Cleaning · Facebook",
    fu: { sent: 2, respondedAt: 0, outcome: "awaiting" },
    sms: [
      { dir: "out", from: "Willis Windows", auto: true, at: "2h", body: "Hi Devon! Thanks for your interest in the free screen cleaning. When works for a quick call?" },
      { dir: "out", from: "Willis Windows", auto: true, at: "1h", body: "Just following up, Devon. Still want to grab that offer before it ends?" },
    ],
  },
  {
    id: "l6", name: "Grant Whitfield", source: "ad", status: "new",
    intent: "2-story full house from ad",
    preview: "Auto follow-up 3 sent · no reply yet",
    when: "1d", wait: "1 day", phone: "(248) 555-0161", location: "Birmingham", zip: "48009",
    ad: "$100 Off First Clean · Facebook",
    fu: { sent: 3, respondedAt: 0, outcome: "awaiting" },
    sms: [
      { dir: "out", from: "Willis Windows", auto: true, at: "1d", body: "Hi Grant! Saw you were interested in a full-house clean. What's the best time to reach you?" },
      { dir: "out", from: "Willis Windows", auto: true, at: "20h", body: "Following up on your window cleaning, Grant. Happy to answer any questions." },
      { dir: "out", from: "Willis Windows", auto: true, at: "4h", body: "Last check-in, Grant. Want me to hold a spot for your free quote this week?" },
    ],
  },
  {
    id: "l7", name: "Dana Whitfield", source: "ad", status: "booked",
    intent: "Spring clean special",
    preview: "Sounds good, I'll take the 2pm Thursday slot.",
    when: "3h", wait: "—", phone: "(248) 555-0173", location: "Bloomfield", zip: "48302",
    ad: "Spring Clean Special · Facebook",
    fu: { sent: 2, respondedAt: 2, outcome: "booked" },
    sms: [
      { dir: "in", from: "Dana", at: "3h", body: "Interested in the spring special before it warms up." },
      { dir: "out", from: "Willis Windows", at: "3h", body: "Great! Let's get you booked in. Does Thursday 2pm work?" },
      { dir: "in", from: "Dana", at: "2h", body: "Sounds good, I'll take the 2pm Thursday slot." },
    ],
  },
  {
    id: "l8", name: "Rachel Simmons", source: "form", status: "working",
    intent: "Storefront, recurring",
    preview: "Yes please call me after 4, I'm free then.",
    when: "5h", wait: "—", phone: "(586) 555-0175", location: "Warren", zip: "48091",
    ad: "Website · Estimate form",
    fu: { sent: 2, respondedAt: 2, outcome: "replied" },
    sms: [
      { dir: "in", from: "Rachel", at: "5h", body: "Need our storefront windows done, maybe monthly." },
      { dir: "out", from: "Willis Windows", at: "5h", body: "Happy to help! Best time to call you with pricing?" },
      { dir: "in", from: "Rachel", at: "4h", body: "Yes please call me after 4, I'm free then." },
    ],
  },
  {
    id: "l9", name: "The Garcia Family", source: "chat", status: "booked",
    intent: "Move-out full clean",
    preview: "Perfect, see the crew at 9am. Thank you!",
    when: "Yest", wait: "—", phone: "(248) 555-0116", location: "Rochester Hills", zip: "48307",
    ad: "Website · Chat widget",
    sms: [
      { dir: "in", from: "Rosa", at: "Yest", body: "We're moving out, need all the windows done before the walkthrough." },
      { dir: "out", from: "Willis Windows", at: "Yest", body: "We can get a crew out first thing. Booked you for 9am tomorrow." },
      { dir: "in", from: "Rosa", at: "Yest", body: "Perfect, see the crew at 9am. Thank you!" },
    ],
  },
  {
    id: "l10", name: "Tom Halloran", source: "ad", status: "won",
    intent: "Exterior, single story",
    preview: "Paid, thanks for the fast work.",
    when: "2d", wait: "—", phone: "(248) 555-0112", location: "Troy", zip: "48084",
    ad: "$100 Off First Clean · Facebook",
    fu: { sent: 1, respondedAt: 1, outcome: "won" },
    sms: [{ dir: "in", from: "Tom", at: "2d", body: "Paid, thanks for the fast work." }],
  },
  {
    id: "l11", name: "Carl Jennings", source: "ad", status: "cold",
    intent: "Never replied to the sequence",
    preview: "All 4 follow-ups sent · never replied",
    when: "5d", wait: "—", phone: "(248) 555-0104", location: "Madison Heights", zip: "48071",
    ad: "Spring Clean Special · Facebook",
    fu: { sent: 4, respondedAt: 0, outcome: "noresponse" },
    sms: [
      { dir: "out", from: "Willis Windows", auto: true, at: "5d", body: "Hi Carl! Thanks for your interest. When can we reach you?" },
      { dir: "out", from: "Willis Windows", auto: true, at: "4d", body: "Following up, Carl. Still want that quote?" },
      { dir: "out", from: "Willis Windows", auto: true, at: "3d", body: "Checking in one more time, Carl." },
      { dir: "out", from: "Willis Windows", auto: true, at: "2d", body: "We'll leave it here for now, Carl. Reply any time and we'll pick right back up." },
    ],
  },
  {
    id: "l12", name: "Bianca Moreno", source: "chat", status: "cold",
    intent: "Asked about pricing, went quiet",
    preview: "No reply after 3 follow-ups.",
    when: "3d", wait: "—", phone: "(248) 555-0121", location: "Clawson", zip: "48017",
    ad: "Website · Chat widget",
    sms: [{ dir: "in", from: "Bianca", at: "3d", body: "how much for a 2-story house?" }],
  },
];

// --- Live GHL mapping -------------------------------------------------------
// A row from GET /api/sales/leads: an ApiLead already tagged server-side with a
// channel `source` and a friendly `status` derived from its real GHL stage.
export type ApiSalesLead = ApiLead & { source: LeadSource; status: LeadStatus };

// Map a live merged lead to a HubLead. The follow-up state (`fu`), the message
// threads, and the location are not on this feed, so they take neutral defaults;
// the conversation loads on select and the follow-up tracker stays demo-only.
function mapApiSalesLead(o: ApiSalesLead): HubLead {
  return {
    id: o.id,
    name: o.name,
    source: o.source,
    status: o.status,
    contactId: o.contactId,
    pipelineId: o.pipelineId,
    pipelineStageId: o.pipelineStageId,
    intent: "",
    preview: "",
    when: timeAgo(o.lastActivityAt),
    wait: "",
    phone: o.phone,
    location: "",
    zip: "",
    ad: SOURCE_META[o.source].label,
    sms: [],
  };
}

// The dataset the page reads. Demo passes the hand-authored worklist through
// unchanged; a real session maps the live merged Paid + Organic leads from
// GET /api/sales/leads.
export function buildLeadsHub(demo: boolean, raw?: unknown[]): LeadsHubDataset {
  const rows = raw ?? [];
  return {
    leads: demo ? (rows as HubLead[]) : (rows as ApiSalesLead[]).map(mapApiSalesLead),
    demo,
  };
}

export function newCount(leads: HubLead[], source?: LeadSource): number {
  return leads.filter((l) => isNew(l) && (!source || l.source === source)).length;
}
