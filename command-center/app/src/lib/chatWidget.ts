// ===========================================================================
// Chat Widget — the inbound website-chat inbox, DEMO DATA.
//
// The "Chat Widget" Sales surface (Organic Pipeline, source = "chat widget").
// It is the *same* surface as Estimate Forms — a conversation inbox worked to a
// call — only the leads start in the website chat bubble instead of a form. A
// visitor opens the chat, leaves a number, the live chat continues over SMS,
// an auto follow-up fires, they say what they want, and a rep picks the next
// step (quotes are given on the phone, never over text). The shared shape + the
// inbox surface live in `leadInbox.ts` / `components/sales/ConversationInbox.tsx`;
// this module just supplies the demo dataset.
//
// There is no GoHighLevel chat feed wired in yet, so this module is the single
// seam where that data will come from. It returns a hand-authored, internally
// consistent set of chat leads (window-cleaning flavoured for client #1, Willis
// Windows) so the surface can be reviewed against realistic conversations. When
// the real source lands (GHL conversations, source = "chat widget", via
// `/api/forms/...`), replace `CHAT_LEADS` with a fetch and keep the exported
// shape intact: the UI reads only `InboxDataset`.
// ===========================================================================

import { mapInboxRow, type ApiInboxRow, type InboxDataset, type InboxLead } from "./leadInbox";

// --- Hand-authored demo inbox ------------------------------------------------
// Website-chat leads for Willis Windows (Metro Detroit). The first-touch is the
// auto follow-up that fires once the visitor leaves a number in the chat; the
// conversation then continues over SMS (and email where they gave one). Covers
// every status so the filters and the empty-thread state all have something to
// show. Names are distinct from the Estimate Forms demo so the two pages feel
// like separate inboxes.

export const CHAT_LEADS: InboxLead[] = [
  {
    id: "cw_marcus",
    name: "Marcus Bell",
    email: "marcus.bell@gmail.com",
    phone: "(248) 555-0231",
    location: "Birmingham",
    zip: "48009",
    status: "replied",
    preview: "Exterior only, 2-story, gutters too…",
    time: "8m",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "10:42 AM",
        body: "Hi Marcus! Thanks for chatting with us on the Willis Windows site 👋 Reply here and we'll get you taken care of.",
      },
      {
        dir: "in",
        from: "Marcus",
        at: "10:55 AM",
        body: "Hey! Exterior windows only, 2-story, about 20 windows. Would also want the gutters cleaned out.",
      },
      {
        dir: "in",
        from: "Marcus",
        at: "10:56 AM",
        body: "Afternoons are easiest for me to talk.",
      },
    ],
    emails: [],
  },
  {
    id: "cw_priya",
    name: "Priya Nair",
    email: "priya.nair@gmail.com",
    phone: "(734) 555-0119",
    location: "Ann Arbor",
    zip: "48104",
    status: "replied",
    preview: "Interior + exterior, condo, screens…",
    time: "44m",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "9:30 AM",
        body: "Hi Priya! Willis Windows here 👋 Saw you reached out on our website chat. Tell us what you're after and we'll sort you out.",
      },
      {
        dir: "in",
        from: "Priya",
        at: "9:48 AM",
        body: "Interior and exterior for a 2-bed condo, plus screen cleaning. Roughly 10 windows.",
      },
    ],
    emails: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "9:30 AM",
        body: "Hi Priya, thanks for chatting with Willis Windows! Which services would you like (interior, exterior, screens, gutters) and roughly how many windows?",
      },
    ],
  },
  {
    id: "cw_kevin",
    name: "Kevin Sullivan",
    email: "ksullivan@outlook.com",
    phone: "(586) 555-0274",
    location: "Royal Oak",
    zip: "48073",
    status: "awaiting",
    preview: "Followed up · no reply yet",
    time: "6h",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Yesterday",
        body: "Hi Kevin! Willis Windows here 👋 Thanks for the message on our site. What can we get cleaned up for you?",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "8:15 AM",
        body: "Hi Kevin, just following up on your window cleaning question from our chat. Happy to give you a quick quote whenever works.",
      },
    ],
    emails: [],
  },
  {
    id: "cw_hannah",
    name: "Hannah Brooks",
    email: "hannah.brooks@gmail.com",
    phone: "(248) 555-0188",
    location: "Ferndale",
    zip: "48220",
    status: "new",
    preview: "Auto follow-up sending…",
    time: "4m",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Just now",
        body: "Hi Hannah! Thanks for chatting with us on the Willis Windows site 👋 Reply here and we'll get you taken care of.",
      },
    ],
    emails: [],
  },
  {
    id: "cw_derek",
    name: "Derek Coleman",
    email: "derek.coleman@yahoo.com",
    phone: "(313) 555-0205",
    location: "Grosse Pointe",
    zip: "48230",
    status: "scheduled",
    preview: "In-person visit booked · Fri 11:00 AM",
    time: "1d",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Wed",
        body: "Hi Derek! Willis Windows here 👋 Thanks for reaching out on our website chat. Tell us what you're after and we'll take care of it.",
      },
      {
        dir: "in",
        from: "Derek",
        at: "Wed",
        body: "Whole house, inside and out, plus a sunroom with a lot of glass. Probably best if someone comes to look.",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "Wed",
        body: "Perfect, we'll come take a look. Booked you in for Friday at 11:00 AM. See you then!",
      },
    ],
    emails: [],
  },
  {
    id: "cw_tanya",
    name: "Tanya Ruiz",
    email: "tanya.ruiz@gmail.com",
    phone: "(810) 555-0143",
    location: "Lapeer",
    zip: "48446",
    status: "notqualified",
    preview: "Out of service area",
    time: "2d",
    sms: [
      {
        dir: "out",
        from: "Willis Windows",
        auto: true,
        at: "Mon",
        body: "Hi Tanya! Willis Windows here 👋 Thanks for the message on our site. What can we get cleaned up for you?",
      },
      {
        dir: "in",
        from: "Tanya",
        at: "Mon",
        body: "Do you cover Lapeer? Need exterior windows on a 2-story.",
      },
      {
        dir: "out",
        from: "Willis Windows",
        at: "Mon",
        body: "Thanks Tanya! Unfortunately Lapeer is just outside our service area right now, so we won't be able to help on this one.",
      },
    ],
    emails: [],
  },
];

// The dataset the page reads. Demo passes the hand-authored inbox through
// unchanged; a real session maps the live Organic-pipeline submissions
// (source = "chat widget") from GET /api/forms/submissions?source=chat-widget.
export function buildChatWidget(demo: boolean, raw?: unknown[]): InboxDataset {
  const rows = raw ?? [];
  return {
    leads: demo
      ? (rows as InboxLead[])
      : (rows as ApiInboxRow[]).map(mapInboxRow),
    demo,
  };
}
