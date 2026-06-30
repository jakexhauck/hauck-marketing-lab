// ===========================================================================
// Lead inbox — the shared shape behind the Sales conversation-inbox surfaces.
//
// Both Estimate Forms (source = "Website Form") and Chat Widget (source =
// "chat widget") are the *same* surface over the Organic Pipeline: a list of
// inbound leads, each replying with what they want, worked to a call. Only the
// source, copy, and demo data differ. These types + helpers are the common
// contract; `estimateForms.ts` and `chatWidget.ts` each supply their dataset,
// and `components/sales/ConversationInbox.tsx` renders them.
// ===========================================================================

import type { Tone } from "./status";

// Where a lead sits in the follow-up flow. Drives the left-rail filters and the
// status pill on each thread.
export type InboxStatus = "new" | "awaiting" | "replied" | "scheduled" | "notqualified";

export const STATUS_META: Record<
  InboxStatus,
  { label: string; tone: Tone; short: string }
> = {
  new: { label: "New", tone: "brand", short: "New" },
  awaiting: { label: "Awaiting reply", tone: "warning", short: "Awaiting" },
  replied: { label: "Replied", tone: "positive", short: "Replied" },
  scheduled: { label: "Scheduled", tone: "brand", short: "Scheduled" },
  notqualified: { label: "Not qualified", tone: "danger", short: "Not qual." },
};

// A single message in a thread. `auto` marks the automated first-touch (the
// follow-up that fires the moment the lead lands); `dir` is from the business's
// point of view (out = we sent it, in = the lead sent it).
export interface ConvMessage {
  dir: "in" | "out";
  // Display sender label ("Sarah", "Willis Windows").
  from: string;
  body: string;
  // Short display time for the bubble ("9:14 AM", "Yesterday").
  at: string;
  auto?: boolean;
}

export type Channel = "sms" | "email";

export interface InboxLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  // City / area + ZIP from the lead's service-address field.
  location: string;
  zip: string;
  status: InboxStatus;
  // One-line preview shown in the inbox list.
  preview: string;
  // Short relative time shown in the inbox list ("20m", "1h", "5h").
  time: string;
  // The two threads. Either can be empty (e.g. a brand-new lead the automation
  // just messaged, no reply yet).
  sms: ConvMessage[];
  emails: ConvMessage[];
}

// What a page hands the shared surface: the leads to show, and whether this is
// demo/preview data (real sessions render the empty, not-connected state).
export interface InboxDataset {
  // Newest first.
  leads: InboxLead[];
  demo: boolean;
}

// Filter counts for the inbox tabs. Computed off whatever set is live.
export function statusCounts(leads: InboxLead[]): Record<InboxStatus, number> {
  const c: Record<InboxStatus, number> = {
    new: 0,
    awaiting: 0,
    replied: 0,
    scheduled: 0,
    notqualified: 0,
  };
  for (const l of leads) c[l.status]++;
  return c;
}
