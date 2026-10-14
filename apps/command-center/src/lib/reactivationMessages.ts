// Client-side shape for the Reactivation > Messages surface, mirroring
// functions/api/reactivation/messages.ts. In a real session the hook fetches
// the recent SMS + email exchanged with reactivation customers (their latest
// touch each), scoped to reactivation-origin contacts. In a demo session api()
// short-circuits to DEMO_REACTIVATION_MESSAGES so the preview reads full without
// touching a real account. Same golden rule as the rest of the app: a real
// client only ever sees their own messages. Read-only reporting, no sending.

export interface ReactivationMessage {
  id: string;
  contactId: string;
  name: string;
  channel: "sms" | "email";
  // What the customer last saw or sent, one line.
  preview: string;
  // ISO timestamp of the last message.
  at: string;
}

export interface ReactivationMessagesData {
  messages: ReactivationMessage[];
  // Present when the source could not be resolved; the surface then shows its
  // honest not-connected state instead of an empty list read as "all done".
  configError?: string;
}

// Willis-flavored preview: the short text + email the win-back campaign sends to
// dormant plumbing customers, plus a couple of replies. Plausible copy, no
// fabricated performance numbers.
export const DEMO_REACTIVATION_MESSAGES: ReactivationMessagesData = {
  messages: [
    {
      id: "rm-1",
      contactId: "c-hend",
      name: "The Hendersons",
      channel: "sms",
      preview: "Yes please, mornings work best for us. Thank you!",
      at: "2026-06-24T15:12:00.000Z",
    },
    {
      id: "rm-2",
      contactId: "c-dunn",
      name: "Carl Dunn",
      channel: "sms",
      preview:
        "Hi Carl, it's Willis Plumbing. It's been a while since we looked after your home. Reply YES and we'll text you a few times for a quick check-up.",
      at: "2026-06-23T13:40:00.000Z",
    },
    {
      id: "rm-3",
      contactId: "c-okafor",
      name: "The Okafors",
      channel: "email",
      preview:
        "We'd love to look after your home again. Book a quick visit this month and we'll take $25 off the first service.",
      at: "2026-06-22T17:05:00.000Z",
    },
    {
      id: "rm-4",
      contactId: "c-reyes",
      name: "The Reyes",
      channel: "sms",
      preview:
        "Hi, it's Willis Plumbing checking in. Your water heater is due for a look. Want us to swing by this week?",
      at: "2026-06-21T14:22:00.000Z",
    },
    {
      id: "rm-5",
      contactId: "c-tran",
      name: "Danielle Tran",
      channel: "email",
      preview: "Sounds good, does next Tuesday afternoon still work?",
      at: "2026-06-20T18:47:00.000Z",
    },
    {
      id: "rm-6",
      contactId: "c-boyd",
      name: "Marcus Boyd",
      channel: "sms",
      preview:
        "Hi Marcus, Willis Plumbing here. We haven't seen you in a while, everything running smoothly at home? Reply and we'll help.",
      at: "2026-06-19T15:33:00.000Z",
    },
  ],
};
