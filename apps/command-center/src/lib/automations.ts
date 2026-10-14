// Read-only model for the Automations surface: the follow-up sequences and
// database reactivation campaigns the agency runs on the client's behalf. There
// is no live automation API yet, so this is representative sample data, clearly
// labelled as such in the UI (see the sample-data banner). Structural only:
// triggers, steps, timing, and how many contacts are enrolled. No fabricated
// conversion or revenue figures.

export type Channel = "sms" | "email" | "call" | "wait";

export type AutomationStatus = "active" | "scheduled" | "paused";

export interface AutomationStep {
  channel: Channel;
  // What this touch is, in the client's words ("Welcome text", not "SMS node").
  label: string;
  // When it fires relative to enrolment ("Day 0", "+1 day", "+3 days").
  delay: string;
  // A short human preview of the touch; omitted for wait steps.
  preview?: string;
}

export interface Automation {
  id: string;
  name: string;
  // Plain-language description of what puts a contact into this sequence.
  trigger: string;
  status: AutomationStatus;
  // Contacts moving through the sequence right now.
  enrolled: number;
  steps: AutomationStep[];
}

export interface ReactivationCampaign extends Automation {
  // Who this wave targets, in plain terms.
  audience: string;
  // Total contacts in the wave and how many have been reached so far.
  listSize: number;
  contacted: number;
}

// ---- Follow-up sequences (always-on, triggered per contact) ----

export const FOLLOW_UPS: Automation[] = [
  {
    id: "speed-to-lead",
    name: "Speed to Lead",
    trigger: "A new lead comes in from any source",
    status: "active",
    enrolled: 23,
    steps: [
      { channel: "sms", label: "Instant hello", delay: "Within 1 min", preview: "Hi {first}, thanks for reaching out. We just got your details and will be right with you." },
      { channel: "email", label: "What to expect", delay: "Within 2 min", preview: "A quick note on next steps and how to reach us." },
      { channel: "call", label: "First call attempt", delay: "+5 min", preview: "Team task: call while the lead is hot." },
      { channel: "wait", label: "Give them space", delay: "+1 day" },
      { channel: "sms", label: "Friendly nudge", delay: "+1 day", preview: "Still here whenever you're ready, {first}. Want to grab a time?" },
      { channel: "email", label: "Proof and value", delay: "+3 days", preview: "Recent work and a few words from happy customers." },
    ],
  },
  {
    id: "appointment-reminders",
    name: "Appointment Reminders",
    trigger: "An appointment is booked",
    status: "active",
    enrolled: 11,
    steps: [
      { channel: "sms", label: "Booking confirmed", delay: "Instant", preview: "You're booked for {date} at {time}. Reply C to confirm." },
      { channel: "email", label: "Calendar invite", delay: "Instant", preview: "Add it to your calendar and find directions." },
      { channel: "wait", label: "Day before", delay: "+1 day" },
      { channel: "sms", label: "See you tomorrow", delay: "1 day before", preview: "Looking forward to seeing you tomorrow at {time}." },
      { channel: "sms", label: "Final reminder", delay: "2 hrs before", preview: "We're all set for {time} today. See you soon." },
    ],
  },
  {
    id: "no-show-recovery",
    name: "No-Show Recovery",
    trigger: "An appointment is marked no-show",
    status: "active",
    enrolled: 4,
    steps: [
      { channel: "sms", label: "Gentle check-in", delay: "+15 min", preview: "We missed you, {first}. Everything okay? Happy to find a new time." },
      { channel: "wait", label: "Next day", delay: "+1 day" },
      { channel: "email", label: "Easy rebooking", delay: "+1 day", preview: "One tap to pick a new slot that suits you." },
      { channel: "call", label: "Personal call", delay: "+2 days", preview: "Team task: a quick call to win the booking back." },
    ],
  },
  {
    id: "estimate-follow-up",
    name: "Estimate Follow-Up",
    trigger: "An estimate or quote is sent",
    status: "active",
    enrolled: 16,
    steps: [
      { channel: "sms", label: "Did it land?", delay: "+1 day", preview: "Hi {first}, just checking the quote came through. Any questions?" },
      { channel: "email", label: "Break it down", delay: "+3 days", preview: "What's included, and why it's worth it." },
      { channel: "wait", label: "A few days", delay: "+4 days" },
      { channel: "call", label: "Decision call", delay: "+7 days", preview: "Team task: call to answer questions and close." },
    ],
  },
  {
    id: "review-request",
    name: "Review Request",
    trigger: "A job is marked complete",
    status: "active",
    enrolled: 9,
    steps: [
      { channel: "wait", label: "Let the dust settle", delay: "+1 day" },
      { channel: "sms", label: "Ask for the review", delay: "+1 day", preview: "Thanks for choosing us, {first}! Mind leaving a quick Google review? {link}" },
      { channel: "email", label: "One more nudge", delay: "+3 days", preview: "It only takes a minute and means the world to us." },
    ],
  },
];

// ---- Database reactivation campaigns (one-off waves over a list) ----

export const REACTIVATIONS: ReactivationCampaign[] = [
  {
    id: "dormant-revival",
    name: "Dormant Lead Revival",
    trigger: "Manual wave over cold leads",
    audience: "Leads that went quiet 3 to 12 months ago",
    status: "active",
    enrolled: 268,
    listSize: 1240,
    contacted: 412,
    steps: [
      { channel: "sms", label: "Re-introduction", delay: "Day 0", preview: "Hi {first}, it's been a while! We've got something we think you'll like." },
      { channel: "wait", label: "Two days", delay: "+2 days" },
      { channel: "email", label: "The offer", delay: "+2 days", preview: "A limited-time reason to come back, with the details." },
      { channel: "sms", label: "Last call", delay: "+5 days", preview: "Closing this out soon, {first}. Want us to hold your spot?" },
    ],
  },
  {
    id: "past-customer-winback",
    name: "Past Customer Win-Back",
    trigger: "Manual wave over lapsed customers",
    audience: "Customers who haven't returned in 6 to 18 months",
    status: "active",
    enrolled: 95,
    listSize: 612,
    contacted: 517,
    steps: [
      { channel: "email", label: "We miss you", delay: "Day 0", preview: "A warm hello and a thank-you for your past business." },
      { channel: "wait", label: "Three days", delay: "+3 days" },
      { channel: "sms", label: "Welcome-back offer", delay: "+3 days", preview: "Here's a little something to welcome you back, {first}." },
      { channel: "call", label: "VIP call", delay: "+6 days", preview: "Team task: a personal call to top past spenders." },
    ],
  },
  {
    id: "seasonal-promo",
    name: "Seasonal Promo Wave",
    trigger: "Scheduled to launch next campaign window",
    audience: "Full database, opted-in contacts",
    status: "scheduled",
    enrolled: 0,
    listSize: 2180,
    contacted: 0,
    steps: [
      { channel: "sms", label: "Teaser", delay: "Day 0", preview: "Something good is coming, {first}. Keep an eye out." },
      { channel: "email", label: "Launch", delay: "+1 day", preview: "The full offer, live for a limited time." },
      { channel: "sms", label: "Final hours", delay: "+4 days", preview: "Last chance, {first}. Ends tonight." },
    ],
  },
];

// Headline counts for the summary band. Derived from the data so the figures
// can never drift from the lists below them. Structural only.
export function automationSummary() {
  const all = [...FOLLOW_UPS, ...REACTIVATIONS];
  const activeCount = all.filter((a) => a.status === "active").length;
  const enrolledNow = all.reduce((n, a) => n + a.enrolled, 0);
  const databaseInPlay = REACTIVATIONS.reduce((n, c) => n + c.listSize, 0);
  const touchesPerJourney = all.reduce((n, a) => n + a.steps.filter((s) => s.channel !== "wait").length, 0);
  return { activeCount, enrolledNow, databaseInPlay, touchesPerJourney, total: all.length };
}
