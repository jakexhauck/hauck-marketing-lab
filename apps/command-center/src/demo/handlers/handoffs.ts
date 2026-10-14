import type { DemoRoute } from "./index";
import type {
  ApiHandoff,
  HandoffMessage,
  HandoffStatus,
  HandoffLostReason,
} from "../../lib/api";

// Demo lead-handoff feed. When a setter qualifies a lead they open a group chat
// connecting the customer with the business owner; that thread lives here. Fully
// internal to the app. Self-contained module state so a handoff created, a
// message sent, or an outcome recorded sticks for the tab's lifetime.
//
// The seed covers every lifecycle state plus one "ignored" lead (new + past the
// reply window) so the accountability flag has something to show.

const MIN = 60_000;
const OWNER = "You";

let handoffs: ApiHandoff[] | null = null;
let threads: Record<string, HandoffMessage[]> | null = null;

interface Seed {
  handoff: Omit<
    ApiHandoff,
    "lastMessage" | "lastMessageAt" | "unread" | "firstOwnerReplyAt"
  >;
  // Messages as [sender, body, minutesAfterHandoff].
  messages: [HandoffMessage["sender"], string, number][];
}

function buildSeeds(now: number): Seed[] {
  const DAY = 24 * 60 * MIN;
  const iso = (minsAgo: number) => new Date(now - minsAgo * MIN).toISOString();
  const ahead = (days: number) => new Date(now + days * DAY).toISOString();
  const h = (
    id: string,
    contactId: string,
    name: string,
    phone: string,
    setterName: string,
    handedMinsAgo: number,
    status: HandoffStatus,
    opts: {
      value?: number | null;
      lostReason?: HandoffLostReason | null;
      estimateMinsAgo?: number | null;
      jobDaysAhead?: number | null;
      followUpDaysAhead?: number | null;
      followUpNote?: string | null;
      address?: string | null;
      service?: string | null;
      closedMinsAgo?: number | null;
    } = {},
  ): Seed["handoff"] => ({
    id,
    contactId,
    name,
    phone,
    setterName,
    status,
    value: opts.value ?? null,
    lostReason: opts.lostReason ?? null,
    handedAt: iso(handedMinsAgo),
    estimateAt: opts.estimateMinsAgo == null ? null : iso(opts.estimateMinsAgo),
    jobAt: opts.jobDaysAhead == null ? null : ahead(opts.jobDaysAhead),
    followUpAt: opts.followUpDaysAhead == null ? null : ahead(opts.followUpDaysAhead),
    followUpNote: opts.followUpNote ?? null,
    address: opts.address ?? null,
    service: opts.service ?? null,
    closedAt: opts.closedMinsAgo == null ? null : iso(opts.closedMinsAgo),
  });

  return [
    // NEW, fresh: setter connected them, customer replied, owner's move. The one
    // to jump into.
    {
      handoff: h("demo-handoff-1", "demo-contact-1", "Marcus Bell", "(555) 812-4471", "Alex R.", 3, "new"),
      messages: [
        ["setter", "Hi Marcus, connecting you here with the owner. You're in great hands from here.", 0],
        ["customer", "Great, thanks! Looking to replace 7 windows across the back of the house.", 1.5],
      ],
    },
    // NEW, ignored: handed off 40 minutes ago, owner never replied. Accountability
    // flag should fire on this one.
    {
      handoff: h("demo-handoff-2", "demo-contact-2", "Tom Rivera", "(555) 668-1207", "Jordan M.", 41, "new"),
      messages: [
        ["setter", "Tom, meet the owner. He can answer anything on pricing and timeline.", 0],
        ["customer", "Thanks. Two bay windows in the living room, hoping to get it done before winter.", 4],
        ["customer", "Anyone there?", 33],
      ],
    },
    // ESTIMATE BOOKED: an in-home measure is scheduled.
    {
      handoff: h("demo-handoff-3", "demo-contact-3", "Denise Park", "(555) 204-9930", "Alex R.", 55, "estimate_set", { estimateMinsAgo: 30, address: "482 Maple Ave, Garden City MI", service: "Window replacement, 5 windows + slider" }),
      messages: [
        ["setter", "Hi Denise, connecting you with the owner about your window quote.", 0],
        ["customer", "Perfect. It's a full front-of-house job, 5 windows and a slider.", 2],
      ],
    },
    // JOB BOOKED: the install is on the calendar (value is recorded at Won).
    {
      handoff: h("demo-handoff-4", "demo-contact-4", "Karen Wells", "(555) 337-8845", "Alex R.", 180, "job_booked", { estimateMinsAgo: 120, jobDaysAhead: 4, address: "17 Beechwood Dr, Garden City MI", service: "Window replacement, 6 windows (upstairs)" }),
      messages: [
        ["setter", "Karen, connecting you with the owner on your window replacement.", 0],
        ["customer", "Hi! Whole upstairs, 6 windows.", 3],
      ],
    },
    // WON: closed, with a job value.
    {
      handoff: h("demo-handoff-5", "demo-contact-5", "Sarah Kim", "(555) 145-6620", "Alex R.", 320, "won", { value: 8400, estimateMinsAgo: 220, closedMinsAgo: 90 }),
      messages: [
        ["setter", "Sarah, connecting you with the owner about your window project.", 0],
        ["customer", "Hi, 8 windows across the main floor.", 4],
        ["owner", "Came out and measured, sending the quote now: $8,400 all in.", 130],
        ["customer", "Looks good, let's do it!", 150],
      ],
    },
    // LOST: not sold, with a reason.
    {
      handoff: h("demo-handoff-6", "demo-contact-6", "Greg Nolan", "(555) 991-2043", "Jordan M.", 400, "lost", { lostReason: "diy", closedMinsAgo: 250 }),
      messages: [
        ["setter", "Greg, meet the owner about your window project.", 0],
        ["customer", "Just one window in the garage, honestly might just DIY it.", 5],
        ["owner", "No problem Greg, reach out if you change your mind. Happy to help.", 30],
      ],
    },
    // LATER: parked for a seasonal follow-up.
    {
      handoff: h("demo-handoff-7", "demo-contact-7", "Bill Torres", "(555) 702-3318", "Alex R.", 500, "later", { closedMinsAgo: 300 }),
      messages: [
        ["setter", "Bill, connecting you with the owner on your window replacement.", 0],
        ["customer", "Interested but we're waiting until spring to budget for it.", 6],
        ["owner", "Totally understand. I'll check back in with you in the spring.", 40],
      ],
    },
  ];
}

function firstOwnerAt(msgs: HandoffMessage[]): string | null {
  return msgs.find((m) => m.sender === "owner")?.at ?? null;
}

function ensure(): { list: ApiHandoff[]; msgs: Record<string, HandoffMessage[]> } {
  if (!handoffs || !threads) {
    const now = Date.now();
    const seeds = buildSeeds(now);
    threads = {};
    handoffs = seeds.map((s) => {
      const base = new Date(s.handoff.handedAt).getTime();
      const msgs: HandoffMessage[] = s.messages.map(([sender, bodyText, mins], i) => ({
        id: `${s.handoff.id}-m${i + 1}`,
        handoffId: s.handoff.id,
        sender,
        senderName:
          sender === "owner" ? OWNER : sender === "setter" ? s.handoff.setterName : s.handoff.name,
        body: bodyText,
        at: new Date(base + mins * MIN).toISOString(),
      }));
      threads![s.handoff.id] = msgs;
      const last = msgs[msgs.length - 1];
      const lastOwnerIdx = msgs.map((m) => m.sender).lastIndexOf("owner");
      // Unread = customer/setter lines after the owner's last reply, but only
      // while the lead is still active (a closed lead is done).
      const active = s.handoff.status !== "won" && s.handoff.status !== "lost";
      const unread = active
        ? msgs.slice(lastOwnerIdx + 1).filter((m) => m.sender !== "owner").length
        : 0;
      return {
        ...s.handoff,
        firstOwnerReplyAt: firstOwnerAt(msgs),
        lastMessage: last ? last.body : null,
        lastMessageAt: last ? last.at : null,
        unread,
      };
    });
  }
  return { list: handoffs, msgs: threads };
}

// Active leads first (newest/hottest at the top), closed ones below, each group
// newest-first.
function sorted(list: ApiHandoff[]): ApiHandoff[] {
  const rank = (h: ApiHandoff) => (h.status === "won" || h.status === "lost" ? 1 : 0);
  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return new Date(b.handedAt).getTime() - new Date(a.handedAt).getTime();
  });
}

function refreshPreview(h: ApiHandoff, msgs: HandoffMessage[]): void {
  const last = msgs[msgs.length - 1];
  h.lastMessage = last ? last.body : null;
  h.lastMessageAt = last ? last.at : null;
}

export const routes: DemoRoute[] = [
  // Collection: list + create (setter hands a lead off).
  {
    match: (clean) => clean === "/api/handoffs",
    respond: ({ method, body }) => {
      const { list, msgs } = ensure();
      if (method === "POST") {
        const id = `demo-handoff-${Math.random().toString(36).slice(2, 8)}`;
        const setterName = String(body.setterName ?? "Alex R.");
        const name = String(body.name ?? "New lead");
        const intro: HandoffMessage = {
          id: `${id}-m1`,
          handoffId: id,
          sender: "setter",
          senderName: setterName,
          body: `${name}, connecting you here with the owner. You're in good hands.`,
          at: new Date().toISOString(),
        };
        msgs[id] = [intro];
        const handoff: ApiHandoff = {
          id,
          contactId: String(body.contactId ?? ""),
          name,
          phone: String(body.phone ?? ""),
          setterName,
          status: "new",
          value: null,
          lostReason: null,
          handedAt: new Date().toISOString(),
          firstOwnerReplyAt: null,
          estimateAt: null,
          jobAt: null,
          followUpAt: null,
          followUpNote: null,
          address: null,
          service: null,
          closedAt: null,
          lastMessage: intro.body,
          lastMessageAt: intro.at,
          unread: 1,
        };
        list.unshift(handoff);
        return { handoff };
      }
      return { handoffs: sorted(list) };
    },
  },
  // Group chat: read + send.
  {
    match: (_clean, seg) =>
      seg.length === 4 && seg[0] === "api" && seg[1] === "handoffs" && seg[3] === "messages",
    respond: ({ seg, method, body }) => {
      const { list, msgs } = ensure();
      const id = seg[2];
      const handoff = list.find((h) => h.id === id);
      const thread = (msgs[id] ??= []);
      if (method === "POST") {
        const now = new Date().toISOString();
        const msg: HandoffMessage = {
          id: `${id}-m${thread.length + 1}`,
          handoffId: id,
          sender: "owner",
          senderName: OWNER,
          body: String(body.body ?? ""),
          at: now,
        };
        thread.push(msg);
        if (handoff) {
          handoff.unread = 0;
          if (!handoff.firstOwnerReplyAt) handoff.firstOwnerReplyAt = now;
          refreshPreview(handoff, thread);
        }
        return { message: msg };
      }
      if (handoff) handoff.unread = 0; // reading clears unread
      return { messages: thread };
    },
  },
  // Single handoff: record lifecycle changes (status / value / lost reason).
  {
    match: (_clean, seg) =>
      seg.length === 3 && seg[0] === "api" && seg[1] === "handoffs",
    respond: ({ seg, body }) => {
      const { list } = ensure();
      const handoff = list.find((h) => h.id === seg[2]);
      if (!handoff) return { handoff: null };
      const now = new Date().toISOString();
      if (typeof body.status === "string") {
        const status = body.status as HandoffStatus;
        handoff.status = status;
        if (status === "won" || status === "lost" || status === "later") {
          handoff.closedAt = now;
        } else {
          handoff.closedAt = null; // reopened / back in play
        }
        handoff.unread = 0;
      }
      if (body.value !== undefined) {
        handoff.value = body.value === null ? null : Number(body.value);
      }
      if (body.lostReason !== undefined) {
        handoff.lostReason = (body.lostReason as HandoffLostReason | null) ?? null;
      }
      // Appointment / follow-up times captured by the prompts.
      if (typeof body.estimateAt === "string") handoff.estimateAt = body.estimateAt;
      if (typeof body.jobAt === "string") handoff.jobAt = body.jobAt;
      if (typeof body.followUpAt === "string") handoff.followUpAt = body.followUpAt;
      if (body.followUpNote !== undefined) {
        handoff.followUpNote = body.followUpNote == null ? null : String(body.followUpNote);
      }
      if (typeof body.address === "string") handoff.address = body.address;
      if (typeof body.service === "string") handoff.service = body.service;
      return { handoff };
    },
  },
];

// Test-only: drop seeded state so a case starts clean.
export function __resetHandoffs(): void {
  handoffs = null;
  threads = null;
}
