// The three call / setup checklists from the Client Setup SOP doc
// (docs.google.com/document/d/1WinSMg8GUejGDsJ6HdG6s8BmNK7-_-Q3Xes5ZUr8ylI),
// one page each at the top of every client (Jake, 2026-10-13).
//
// Copied from the doc as written, not stored in the DB: they change rarely and
// Jake edits the doc, not the app. Ticks are saved per client in the same
// onboarding_checklist table as Setup Checklist, under a "sop:<list>:<item>"
// task key so they never collide with a setup step's id. Renaming an item
// changes its key and drops its tick, so reword sparingly.

export type SopListId = "full-setup" | "onboarding-call" | "launch-call";

export interface SopItem {
  label: string;
  note?: string;
}

export interface SopSection {
  title: string;
  // An optional caption above some of the items (the doc's sub-headings).
  groups: { label: string | null; items: SopItem[] }[];
}

export interface SopList {
  id: SopListId;
  title: string;
  sections: SopSection[];
}

const plain = (...labels: string[]): SopItem[] => labels.map((label) => ({ label }));
const one = (title: string, items: SopItem[]): SopSection => ({ title, groups: [{ label: null, items }] });

export const SOP_LISTS: Record<SopListId, SopList> = {
  "full-setup": {
    id: "full-setup",
    title: "Full Setup Checklist",
    sections: [
      one(
        "Operations / Onboarding Call",
        plain(
          "Invoice Paid",
          "Contract Signed",
          "Onboarding Call Done",
          "Marketing Assets Sent",
          "Ad Account Access",
          "Software Account Made",
          "Client Folder Made",
        ),
      ),
      one(
        "GHL",
        plain(
          "Add Jake & Client As Staff",
          "Connect Facebook To GHL",
          "Buy & Apply Subdomain",
          "Custom Values Set",
          "Custom Fields Set",
          "Calendar Availability/Settings Configured",
          "Conversion Assets Created/Placed Into Funnel",
          "Create Lead Form Custom Values Created & Set",
          "Turn Off Message Compliance",
        ),
      ),
      one(
        "Phone",
        plain(
          "A2P Submitted",
          "Local Number Bought",
          "Appointment Outcome # Bought",
          "Facebook Ad Speed To Lead # Bought",
          "Turn On Call Recording & Transcription",
          "Call Routing to Owner Phone Number",
        ),
      ),
      {
        title: "GHL Follow Ups",
        groups: [
          { label: "Appointments", items: plain("Phone Appointment", "Estimate Reminders", "Job Reminders") },
          { label: "Attribution", items: plain("Conversions API (Leads)") },
          { label: "Follow Ups", items: plain("Long Term Nurture", "Lead Form FU's") },
        ],
      },
      one(
        "Facebook Ads",
        plain(
          "Link Ad Account To Command Center",
          "Lead Form Setup",
          "Creatives Done/Added To Media Library",
          "Campaign Setup",
          "Ads LIVE",
        ),
      ),
    ],
  },
  "onboarding-call": {
    id: "onboarding-call",
    title: "Onboarding Call",
    sections: [
      {
        title: "Before The Call",
        groups: [
          {
            label: "Finish Client Operational Setup",
            items: [
              { label: "Make Google Drive Folder", note: "🤝 | [CLIENT NAME]" },
              {
                label: "Copy Assets Within \"Client Setup\" Folder Into Client Folder With Proper Naming Conventions",
                note: "WW | Video Scripts",
              },
              { label: "Customize Dialling Script" },
              { label: "Setup Sub Account" },
            ],
          },
        ],
      },
      one("Todo", [
        { label: "Access Business Manager" },
        { label: "Log Into Software & Explain" },
        { label: "Set Expectations" },
        { label: "Get Assets For Marketing" },
        { label: "Dialing Script", note: "If needed" },
      ]),
      {
        title: "Setting Expectations",
        groups: [
          {
            label: null,
            items: [
              { label: "Expect around X-Y leads in the first week" },
              { label: "Usually about ## in month 1", note: "First appointments in X timeframe" },
              { label: "First lead will come in around 2-3 days" },
              { label: "Not every lead is going to be quality, that's just the way it goes" },
              { label: "Lead quality always starts out the worst, and improves over time" },
            ],
          },
        ],
      },
    ],
  },
  "launch-call": {
    id: "launch-call",
    title: "Launch Call",
    sections: [
      {
        title: "Before The Call",
        groups: [
          {
            label: "Make Sure Account Is Fully Done",
            items: plain(
              "Follow Ups",
              "Appointment Automations",
              "CAPI",
              "Campaign, Adset, Creatives, Copy, Lead Form",
              "Make Sure Software Account Is Fully Done",
            ),
          },
        ],
      },
      one(
        "Todo",
        plain(
          "Go Over Creatives",
          "Go Over Copy/Headlines",
          "Go Over Lead Form",
          "Go Over GHL Automations",
          "Explain Software",
          "Send Test SMS & Have Client Save Both Outcome Numbers",
        ),
      ),
    ],
  },
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// The saved key for one item. The section is part of it because the doc
// repeats labels across sections (Follow Ups, Todo).
export function sopTaskKey(list: SopListId, section: string, item: string): string {
  return `sop:${list}:${slug(section)}:${slug(item)}`;
}

export function sopKeys(list: SopList, section?: SopSection): string[] {
  const sections = section ? [section] : list.sections;
  return sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => sopTaskKey(list.id, s.title, i.label))));
}
