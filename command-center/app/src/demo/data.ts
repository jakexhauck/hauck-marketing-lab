// Fabricated dataset for the demo client view. One coherent persona ("Coastal
// Roofing Co") whose leads, contacts, conversations, invoices, activity and
// calendar all reference each other, so every client screen renders believable,
// internally consistent data. Deterministic (seeded PRNG) so the demo looks the
// same on every open. Pure: returns a fresh object each call; the store owns
// mutation.

import type {
  ApiTenant,
  ApiPipelineSummary,
  ApiLead,
  ApiContact,
  ApiConversation,
  ApiMessage,
  ApiActivity,
  ApiNotification,
  ApiInvoice,
  ApiInvoiceDetail,
  ApiTransaction,
  ApiCalendarEvent,
  ApiNote,
  ApiTask,
} from "../lib/api";

export interface DemoData {
  tenant: ApiTenant;
  pipelines: ApiPipelineSummary[];
  leads: ApiLead[];
  contacts: ApiContact[];
  conversations: ApiConversation[];
  messages: Record<string, ApiMessage[]>;
  activity: ApiActivity[];
  notifications: ApiNotification[];
  invoices: ApiInvoice[];
  invoiceDetails: Record<string, ApiInvoiceDetail>;
  transactions: ApiTransaction[];
  calendar: ApiCalendarEvent[];
  notes: Record<string, ApiNote[]>;
  tasks: Record<string, ApiTask[]>;
}

// Deterministic PRNG so the demo is stable across reloads.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Bob", "Linda", "James", "Susan", "Mark", "Diane", "Greg", "Patty",
  "Kevin", "Nancy", "Ron", "Theresa", "Frank", "Wendy", "Carl", "Joanne",
  "Steve", "Marie", "Doug", "Holly", "Paul", "Rita", "Glen", "Brenda",
];
const LAST = [
  "Anderson", "Murphy", "Bennett", "Cooper", "Diaz", "Edwards", "Foster",
  "Greene", "Harris", "Iverson", "Jacobs", "Klein", "Lopez", "Mitchell",
  "Nguyen", "Owens", "Perez", "Quinn", "Roberts", "Sanchez", "Turner",
  "Underwood", "Vargas", "Walker",
];
const ADS = [
  "Spring Roof Promo",
  "Free Estimate Lead Form",
  "Storm Damage Inspection",
  "Senior Roof Discount",
  "Free Drone Inspection",
];
const CAMPAIGN = "FB-Lead-Form-2026-Q2";
const ADSET = "Homeowners 35-65 · 25mi";

const INBOUND_SNIPPETS = [
  "Hi, I saw your ad about free roof inspections. Is that still available?",
  "How soon could someone come out for an estimate?",
  "Do you handle insurance claims for storm damage?",
  "What's the ballpark cost to replace a 2,000 sq ft roof?",
  "Just got off the phone, thanks. Sending photos now.",
  "Can we reschedule the inspection to Thursday?",
  "Does the quote include hauling away the old shingles?",
];
const OUTBOUND_SNIPPETS = [
  "Absolutely, we'd be glad to help. What's the best day for a free inspection?",
  "Great news, we can usually get someone out within 48 hours.",
  "Yes, we work directly with all major insurance carriers.",
  "I'll get that estimate over to you today. Thanks for reaching out!",
];

const STAGES = [
  { id: "demo-stage-0", name: "New Lead" },
  { id: "demo-stage-1", name: "Contacted" },
  { id: "demo-stage-2", name: "Estimate Sent" },
  { id: "demo-stage-3", name: "Job Scheduled" },
];
const PIPELINE_ID = "demo-pipeline-1";
const PIPELINE_NAME = "Roofing Sales Pipeline";

const LEAD_COUNT = 24;
const DAY = 24 * 60 * 60 * 1000;

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function phone(rng: () => number): string {
  const a = Math.floor(rng() * 900) + 100;
  const b = Math.floor(rng() * 9000) + 1000;
  return `(555) ${a}-${b}`;
}

function status(rng: () => number): "open" | "won" | "lost" {
  const r = rng();
  if (r < 0.7) return "open";
  if (r < 0.88) return "won";
  return "lost";
}

function stageIndex(rng: () => number, s: "open" | "won" | "lost"): number {
  if (s !== "open") return Math.floor(rng() * STAGES.length);
  const r = rng();
  return Math.min(STAGES.length - 1, Math.floor(r * r * STAGES.length));
}

export function buildDemoData(now: number = Date.now()): DemoData {
  const rng = mulberry32(424242);

  const tenant: ApiTenant = {
    name: "Coastal Roofing Co",
    niche: "Roofing",
    brandColor: "#2563eb",
    brandInitials: "CR",
    appName: "Coastal Leads",
    wonLabel: "Sold",
    valueLabel: "Job Value",
    monthlySpend: 2400,
    websiteUrl: "https://rivertownplumbing.com",
  };

  const pipelines: ApiPipelineSummary[] = [
    { id: PIPELINE_ID, name: PIPELINE_NAME, stages: STAGES },
  ];

  const leads: ApiLead[] = [];
  const contacts: ApiContact[] = [];
  const messages: Record<string, ApiMessage[]> = {};
  const conversations: ApiConversation[] = [];
  // Cycle channel + source across demo conversations so the Unified Inbox
  // filter rails show real spread in demo / test mode.
  const DEMO_CHANNELS = ["sms", "email", "ig", "messenger", "sms", "sms"] as const;
  const DEMO_ORIGINS = [
    "form",
    "chat",
    "paid",
    "react",
    "call",
    "social",
  ] as const;
  // Realistic raw "source" strings (what GHL would store), shown in the
  // origin strip alongside the classified badge.
  const DEMO_SOURCE_LABEL: Record<(typeof DEMO_ORIGINS)[number], string> = {
    form: "Website Form",
    chat: "Chat Widget",
    paid: "Facebook Ads",
    react: "Reactivation Campaign",
    call: "Inbound Call",
    social: "Instagram DM",
  };
  const notes: Record<string, ApiNote[]> = {};
  const tasks: Record<string, ApiTask[]> = {};

  for (let i = 0; i < LEAD_COUNT; i++) {
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    const name = `${first} ${last}`;
    const st = status(rng);
    const sIdx = stageIndex(rng, st);
    const stage = STAGES[sIdx];
    // Spread created dates over ~30 days; a couple land "today" to feed newToday.
    const ageDays = i < 3 ? rng() * 0.4 : rng() * 30;
    const createdAt = now - ageDays * DAY;
    const lastActivityAt = createdAt + rng() * (now - createdAt);
    const ad = pick(rng, ADS);
    const value =
      st === "won"
        ? Math.round((4000 + rng() * 21000) / 50) * 50
        : st === "open" && sIdx >= 2
          ? Math.round((4000 + rng() * 21000) / 50) * 50
          : null;
    const leadId = `demo-lead-${i + 1}`;
    const contactId = `demo-contact-${i + 1}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
    const ph = phone(rng);
    const tags = i % 4 === 0 ? ["storm-damage"] : i % 5 === 0 ? ["repeat"] : [];

    leads.push({
      id: leadId,
      name,
      phone: ph,
      email,
      contactId,
      pipelineId: PIPELINE_ID,
      pipelineStageId: stage.id,
      status: st,
      value,
      createdAt: new Date(createdAt).toISOString(),
      lastActivityAt: new Date(lastActivityAt).toISOString(),
      assignedUserId: null,
      attribution: {
        source: "Facebook",
        campaign: CAMPAIGN,
        ad,
        adset: ADSET,
      },
      tags,
    });

    contacts.push({
      id: contactId,
      name,
      phone: ph,
      email,
      source: ad,
      tags,
      createdAt: new Date(createdAt).toISOString(),
      lastActivityAt: new Date(lastActivityAt).toISOString(),
    });

    // A short two-sided thread for the more active leads; seeds conversations.
    if (i < 12) {
      const thread: ApiMessage[] = [];
      const inAt = lastActivityAt - rng() * 2 * DAY;
      thread.push({
        id: `${contactId}-m1`,
        body: INBOUND_SNIPPETS[i % INBOUND_SNIPPETS.length],
        direction: "inbound",
        type: "SMS",
        at: new Date(inAt).toISOString(),
      });
      if (sIdx >= 1 || st !== "open") {
        thread.push({
          id: `${contactId}-m2`,
          body: OUTBOUND_SNIPPETS[i % OUTBOUND_SNIPPETS.length],
          direction: "outbound",
          type: "SMS",
          at: new Date(inAt + 30 * 60_000).toISOString(),
        });
      }
      messages[contactId] = thread;

      const lastMsg = thread[thread.length - 1];
      const unread = i < 3 ? 1 : 0;
      conversations.push({
        id: `demo-conv-${i + 1}`,
        contactId,
        name,
        preview: lastMsg.body,
        lastMessageType: lastMsg.type,
        lastMessageAt: lastMsg.at,
        unreadCount: unread,
        channel: DEMO_CHANNELS[i % DEMO_CHANNELS.length],
        origin: DEMO_ORIGINS[i % DEMO_ORIGINS.length],
        source: DEMO_SOURCE_LABEL[DEMO_ORIGINS[i % DEMO_ORIGINS.length]],
        firstTouchAt: new Date(createdAt).toISOString(),
      });
    }

    // A couple of contacts carry notes + tasks for the contact detail surfaces.
    if (i === 0 || i === 4) {
      notes[contactId] = [
        {
          id: `${contactId}-note-1`,
          body: "Homeowner, two-story colonial. Prefers calls after 5pm.",
          dateAdded: new Date(lastActivityAt).toISOString(),
        },
      ];
      tasks[contactId] = [
        {
          id: `${contactId}-task-1`,
          title: "Send finalized estimate PDF",
          dueDate: new Date(now + 1 * DAY).toISOString(),
          completed: false,
        },
        {
          id: `${contactId}-task-2`,
          title: "Confirm material color choice",
          dueDate: new Date(now + 3 * DAY).toISOString(),
          completed: false,
        },
      ];
    }
  }

  // Activity feed: newest-first, derived from the leads we just made.
  const activity: ApiActivity[] = [];
  let actId = 1000;
  const recent = [...leads]
    .sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    )
    .slice(0, 16);
  for (const l of recent) {
    let summary: string;
    let action: string;
    if (l.status === "won") {
      action = "opportunity.won";
      summary = `${l.name} marked Sold${l.value ? ` ($${l.value.toLocaleString()})` : ""}`;
    } else if (l.status === "lost") {
      action = "opportunity.lost";
      summary = `${l.name} marked Lost`;
    } else if (l.pipelineStageId === STAGES[0].id) {
      action = "contact.created";
      summary = `New lead: ${l.name}`;
    } else {
      action = "opportunity.stage_changed";
      const st = STAGES.find((s) => s.id === l.pipelineStageId);
      summary = `${l.name} moved to ${st?.name ?? "next stage"}`;
    }
    activity.push({
      id: actId++,
      action,
      lead_id: l.id,
      payload: { summary, contact_id: l.contactId, opportunity_id: l.id },
      created_at: l.lastActivityAt,
    });
  }

  // Notifications reuse the activity shape; the three newest are unread.
  const notifications: ApiNotification[] = activity.slice(0, 8).map((a, i) => ({
    ...a,
    read_at: i < 3 ? null : new Date(now - (i + 1) * DAY).toISOString(),
  }));

  // Invoices tied to won leads, plus a couple outstanding.
  const wonLeads = leads.filter((l) => l.status === "won");
  const invoices: ApiInvoice[] = [];
  const invoiceDetails: Record<string, ApiInvoiceDetail> = {};
  const transactions: ApiTransaction[] = [];
  let invNo = 1042;
  wonLeads.slice(0, 6).forEach((l, i) => {
    const id = `demo-inv-${i + 1}`;
    const number = `INV-${invNo++}`;
    const total = l.value ?? 6000;
    const paid = i % 3 !== 0; // ~2/3 paid, rest outstanding
    const overdue = !paid && i % 2 === 0;
    const issued = now - (10 + i * 3) * DAY;
    const due = issued + 14 * DAY;
    const paidAt = paid ? new Date(issued + 5 * DAY).toISOString() : null;
    const st = paid ? "paid" : overdue ? "overdue" : "sent";

    invoices.push({
      id,
      number,
      contactName: l.name,
      total,
      status: st,
      dueDate: new Date(due).toISOString(),
      paidAt,
    });
    invoiceDetails[id] = {
      id,
      number,
      contactName: l.name,
      status: st,
      total,
      amountPaid: paid ? total : 0,
      amountDue: paid ? 0 : total,
      currency: "USD",
      issueDate: new Date(issued).toISOString(),
      dueDate: new Date(due).toISOString(),
      paidAt,
      items: [
        { name: "Roof replacement labor", qty: 1, amount: Math.round(total * 0.6) },
        { name: "Materials (shingles, underlayment)", qty: 1, amount: Math.round(total * 0.4) },
      ],
    };
    if (paid) {
      transactions.push({
        id: `demo-txn-${i + 1}`,
        amount: total,
        status: "succeeded",
        contactName: l.name,
        createdAt: paidAt,
        method: "card",
      });
    }
  });

  // A fuller settled-payment history so the derived revenue views (12-month
  // trend, month-over-month, collected YTD, top customers) render richly in the
  // demo. Real sessions derive the exact same views from live GHL transactions;
  // this only shapes the ?demo=1 preview. A pool of repeat customers gives the
  // Top Customers rail clear leaders; amounts are plausible roofing tickets.
  const REPEAT_CUSTOMERS = Array.from(
    { length: 14 },
    () => `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
  );
  const METHODS = ["card", "ACH", "card", "cash"];
  const nowDate = new Date(now);
  const currentDay = nowDate.getDate();
  let histNo = 100;
  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
    const perMonth = 4 + Math.floor(rng() * 3); // 4-6 payments a month
    // Keep the current month's payments on or before today so "revenue this
    // month" reads healthy in the demo even early in the month (otherwise it
    // derives to $0 with a scary -100% MoM on, say, the 2nd).
    const dayCeiling = monthsAgo === 0 ? Math.max(1, currentDay) : 26;
    for (let k = 0; k < perMonth; k++) {
      const when = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth() - monthsAgo,
        1 + Math.floor(rng() * dayCeiling),
        11,
        0,
        0,
      );
      if (when.getTime() > now) continue; // safety: never a future-dated payment
      transactions.push({
        id: `demo-txn-h-${histNo++}`,
        amount: Math.round((3000 + rng() * 15000) / 50) * 50,
        status: "succeeded",
        contactName: pick(rng, REPEAT_CUSTOMERS),
        createdAt: when.toISOString(),
        method: pick(rng, METHODS),
      });
    }
  }
  // Newest first, matching how GHL returns the transactions feed.
  transactions.sort(
    (a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0),
  );

  // Upcoming appointments tied to active contacts.
  const calendar: ApiCalendarEvent[] = [];
  const apptContacts = contacts.slice(0, 5);
  apptContacts.forEach((c, i) => {
    const start = now + (i + 1) * DAY + 9 * 60 * 60_000; // 9am, next N days
    calendar.push({
      id: `demo-evt-${i + 1}`,
      title: i % 2 === 0 ? "Roof Inspection" : "Estimate Review",
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + 60 * 60_000).toISOString(),
      status: "confirmed",
      contactId: c.id,
      contactName: c.name,
      address: `${100 + i * 7} Harbor View Dr`,
      meetingUrl: "",
      notes: i % 2 === 0 ? "Bring drone + ladder." : "Review material samples.",
    });
  });

  return {
    tenant,
    pipelines,
    leads,
    contacts,
    conversations,
    messages,
    activity,
    notifications,
    invoices,
    invoiceDetails,
    transactions,
    calendar,
    notes,
    tasks,
  };
}
