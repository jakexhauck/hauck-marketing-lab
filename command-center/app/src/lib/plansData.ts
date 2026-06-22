// Plans: a simple, curated roadmap shown in the admin console (read-only). Each
// entry is one initiative with a one-line description and where it stands. This
// is a hand-kept snapshot, not generated from the docs/build-plans folder, so
// when a plan is added, shipped, or dropped, update this list. Newest/most
// active first. Keep descriptions to a single plain sentence.

export type PlanStatus = "planned" | "in-progress" | "shipped";

export interface Plan {
  title: string;
  description: string;
  status: PlanStatus;
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  planned: "Planned",
  "in-progress": "In progress",
  shipped: "Shipped",
};

export const PLANS: Plan[] = [
  {
    title: "Client Google Drive (Assets for clients)",
    description:
      "Give every client an Assets tab to connect their own Google Drive and browse, upload, and organize files, with the agency able to view each client's Drive too. Uses the drive.file scope so no Google verification is needed. Waiting on Google Cloud credentials.",
    status: "planned",
  },
  {
    title: "In-app onboarding",
    description:
      "A magic-link invite that drops a new client into a themed in-app onboarding form, feeding an admin Onboarding tab and a 27-task operations checklist.",
    status: "planned",
  },
  {
    title: "GHL auto-provisioning",
    description:
      "Creating a client in the admin auto-provisions a fresh GoHighLevel sub-account for them in one reviewed step.",
    status: "planned",
  },
  {
    title: "SOP triage checkboxes",
    description:
      "Add a checkbox to every SOP row in the SOP Hub so you can flag which SOPs still need review or rework.",
    status: "in-progress",
  },
  {
    title: "Build-loop automation",
    description:
      "Close the loop so a described change ships end to end (build, verify, commit, push, watch deploy, smoke-test) with near-zero manual input.",
    status: "in-progress",
  },
  {
    title: "Team comms panel",
    description:
      "A Discord-style internal team chat: member roster, cosmetic roles, live presence, channels and DMs, a direct line to Jake, attachments, and push.",
    status: "shipped",
  },
  {
    title: "Willis Windows launch",
    description:
      "Get client #1 (Willis Windows) fully live on the Command Center, then layer on push notifications and offline support.",
    status: "shipped",
  },
];
