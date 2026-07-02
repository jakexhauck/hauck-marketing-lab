// ===========================================================================
// Estimate Forms — the inbound website estimate-request inbox, DEMO DATA.
//
// This is the "Estimate Forms" Sales surface (Organic Pipeline, source =
// "Website Form"). A form is submitted, an auto email + SMS fire, the lead
// replies with what they want, and a rep picks the next step (quotes are given
// on the phone, never over text). The page is a conversation inbox: a list of
// submissions on the left, the selected lead's contact + action bar +
// SMS/Email threads on the right. The shared shape + the inbox surface live in
// `leadInbox.ts` / `components/sales/ConversationInbox.tsx`; this module just
// supplies the demo dataset.
//
// There is no GoHighLevel forms feed wired in yet, so this module is the single
// seam where that data will come from. It returns a hand-authored, internally
// consistent set of estimate requests (window-cleaning flavoured for client #1,
// Willis Windows) so the surface can be built and reviewed against realistic
// conversations. When the real source lands (GHL conversations + form
// submissions via `/api/forms/...`), replace `ESTIMATE_LEADS` with a fetch and
// keep the exported shape intact: the UI reads only `InboxDataset`.
// ===========================================================================

import { mapInboxRow, type ApiInboxRow, type InboxDataset, type InboxLead } from "./leadInbox";

// --- Hand-authored demo inbox ------------------------------------------------
// Window-cleaning estimate requests for Willis Windows (Metro Detroit). Covers
// every status so the filters and the empty-thread state all have something to
// show.

export const ESTIMATE_LEADS: InboxLead[] = [
  {
    id: "ef_sarah",
    name: "Sarah Mitchell",
    email: "sarah.m@gmail.com",
    phone: "(248) 555-0142",
    location: "Royal Oak",
    zip: "48067",
    status: "replied",
    preview: "Interior + exterior, 2-story colonial…",
    time: "20m",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "8:52 AM",
        body: "Hi Sarah! Willis Windows here 👋 Reply with what you're after and we'll get you taken care of.",
      },
      {
        dir: "in",
        from: "Sarah",
        at: "9:10 AM",
        body: "Hi! I'd want both interior and exterior. 2-story colonial, about 18 windows. Also interested in screen cleaning.",
      },
      {
        dir: "in",
        from: "Sarah",
        at: "9:11 AM",
        body: "Mornings work best for me this week if possible.",
      },
    ],
    emails: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "8:52 AM",
        body: "Hi Sarah, thanks for requesting an estimate with Willis Windows! Which services would you like (interior, exterior, screens, gutters) and roughly how many windows?",
      },
    ],
  },
  {
    id: "ef_tom",
    name: "Tom Becker",
    email: "t.becker@outlook.com",
    phone: "(586) 555-0188",
    location: "Sterling Heights",
    zip: "48310",
    status: "replied",
    preview: "Windows + screen cleaning, single story…",
    time: "1h",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "7:40 AM",
        body: "Hi Tom! Willis Windows here 👋 Tell us what you need and we'll sort you out.",
      },
      {
        dir: "in",
        from: "Tom",
        at: "8:05 AM",
        body: "Exterior windows + screens. Single story ranch, 12 windows. What's the damage?",
      },
    ],
    emails: [],
  },
  {
    id: "ef_mike",
    name: "Mike Reynolds",
    email: "mreynolds@gmail.com",
    phone: "(248) 555-0119",
    location: "Troy",
    zip: "48084",
    status: "awaiting",
    preview: "Followed up · email opened, no reply",
    time: "5h",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Yesterday",
        body: "Hi Mike! Willis Windows here 👋 Reply with what you're after and we'll get you a quick estimate.",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "10:20 AM",
        body: "Hi Mike, just checking in on your window cleaning request. Happy to give you a quick quote whenever works.",
      },
    ],
    emails: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Yesterday",
        body: "Hi Mike, thanks for reaching out to Willis Windows. Let us know which services you're after and we'll get you an estimate.",
      },
    ],
  },
  {
    id: "ef_linda",
    name: "Linda Vasquez",
    email: "linda.vasquez@yahoo.com",
    phone: "(313) 555-0167",
    location: "Dearborn",
    zip: "48124",
    status: "awaiting",
    preview: "Followed up · SMS delivered",
    time: "9h",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Yesterday",
        body: "Hi Linda! Willis Windows here 👋 What can we get cleaned up for you?",
      },
    ],
    emails: [],
  },
  {
    id: "ef_aisha",
    name: "Aisha Khan",
    email: "aisha.k@gmail.com",
    phone: "(248) 555-0203",
    location: "Novi",
    zip: "48375",
    status: "new",
    preview: "Auto follow-up sending…",
    time: "12m",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Just now",
        body: "Hi Aisha! Willis Windows here 👋 Reply with what you're after and we'll get you taken care of.",
      },
    ],
    emails: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Just now",
        body: "Hi Aisha, thanks for requesting an estimate with Willis Windows! Which services would you like and roughly how many windows?",
      },
    ],
  },
  {
    id: "ef_dwayne",
    name: "Dwayne Foster",
    email: "dfoster@gmail.com",
    phone: "(586) 555-0151",
    location: "Warren",
    zip: "48088",
    status: "scheduled",
    preview: "In-person visit booked · Thu 2:00 PM",
    time: "1d",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Wed",
        body: "Hi Dwayne! Willis Windows here 👋 Tell us what you're after and we'll get you taken care of.",
      },
      {
        dir: "in",
        from: "Dwayne",
        at: "Wed",
        body: "Big job, whole house inside and out plus gutters. Probably need someone to come look.",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "Wed",
        body: "Perfect, we'll come take a look. Booked you in for Thursday at 2:00 PM. See you then!",
      },
    ],
    emails: [],
  },
  {
    id: "ef_grace",
    name: "Grace Okafor",
    email: "grace.okafor@gmail.com",
    phone: "(810) 555-0192",
    location: "Flint",
    zip: "48507",
    status: "notqualified",
    preview: "Out of service area",
    time: "2d",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Mon",
        body: "Hi Grace! Willis Windows here 👋 What can we get cleaned up for you?",
      },
      {
        dir: "in",
        from: "Grace",
        at: "Mon",
        body: "Are you guys in Flint? Need exterior windows done.",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "Mon",
        body: "Thanks Grace! Unfortunately Flint is just outside our service area right now, so we won't be able to help on this one.",
      },
    ],
    emails: [],
  },
];

// The dataset the page reads. Demo passes the hand-authored inbox through
// unchanged; a real session maps the live Organic-pipeline submissions
// (source = "Website Form") from GET /api/forms/submissions?source=website-form.
export function buildEstimateForms(demo: boolean, raw?: unknown[]): InboxDataset {
  const rows = raw ?? [];
  return {
    leads: demo
      ? (rows as InboxLead[])
      : (rows as ApiInboxRow[]).map(mapInboxRow),
    demo,
  };
}
