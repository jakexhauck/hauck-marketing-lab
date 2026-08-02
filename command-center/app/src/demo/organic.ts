import type { OrganicDetail, OrganicLead } from "../lib/organic";

// Hand-authored website leads for the demo client view, one per channel so both
// columns and both detail shapes have something to show.
//
// Shaped exactly like the live payload, including the awkward parts: the chat
// lead has a message and no form answers, the form lead has answers and no
// message. That is how GHL actually stores them, so the demo cannot flatter the
// page into looking better than it is.

const HOUR = 60 * 60_000;

export function demoOrganicLeads(now: number = Date.now()): OrganicLead[] {
  return [
    {
      id: "org_demo_form",
      contactId: "org_demo_form_contact",
      name: "Dana Ruiz",
      phone: "(248) 555-0148",
      email: "dana.ruiz@gmail.com",
      createdAt: new Date(now - 2 * HOUR).toISOString(),
      stageName: "Estimate Form",
      channel: "form",
    },
    {
      id: "org_demo_chat",
      contactId: "org_demo_chat_contact",
      name: "Edie Whelan",
      phone: "(248) 555-0940",
      email: "edie.whelan@gmail.com",
      createdAt: new Date(now - 30 * HOUR).toISOString(),
      stageName: "Chat Widget",
      channel: "chat",
    },
  ];
}

export function demoOrganicDetail(contactId: string): OrganicDetail | null {
  const now = Date.now();
  if (contactId === "org_demo_form_contact") {
    return {
      contactId,
      name: "Dana Ruiz",
      phone: "(248) 555-0148",
      email: "dana.ruiz@gmail.com",
      source: "website form",
      landingUrl: "https://example.com/windows-quote",
      sessionSource: "Google",
      createdAt: new Date(now - 2 * HOUR).toISOString(),
      messages: [],
      answers: [
        { label: "What is the scope of this project?", value: "Whole house, 14 windows" },
        { label: "Timeline for project?", value: "Next 30 days" },
        { label: "Street Address", value: "812 Maple Ave" },
        { label: "Postal Code", value: "48009" },
      ],
      answersUnavailable: false,
    };
  }
  if (contactId === "org_demo_chat_contact") {
    return {
      contactId,
      name: "Edie Whelan",
      phone: "(248) 555-0940",
      email: "edie.whelan@gmail.com",
      source: "chat widget",
      landingUrl: "https://example.com/privacy-policy",
      sessionSource: "Social media",
      createdAt: new Date(now - 30 * HOUR).toISOString(),
      messages: [
        {
          id: "org_demo_msg_1",
          body: "Do you go out to Wolverine Lake in Commerce Township?",
          direction: "inbound",
          at: new Date(now - 30 * HOUR).toISOString(),
        },
      ],
      answers: [],
      answersUnavailable: false,
    };
  }
  return null;
}
