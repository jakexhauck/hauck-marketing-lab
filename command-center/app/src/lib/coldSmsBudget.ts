// Acquisition > SMS Budget (Jake, 2026-10-05): the month's PLANNED cold SMS
// spend, line by line. Shared by the page and the API route, so the server
// stores exactly the keys the page computes from.
//
// The chain: leads checked by Twilio Lookup -> the textable share (mobile and
// phone-app numbers) is texted the whole sequence -> a share of those reply.
// GHL bills every segment both ways, carriers add a fee on outbound ones.
//
// Rate defaults are the published prices as of 2026-10-05: Twilio Lookup Line
// Type Intelligence $0.008, LC Phone $0.0079 a segment each way, carrier fees
// $0.004 to $0.010 (low end used), number $1.15/mo, A2P Standard campaign
// $10/mo. Every one is a typed cell, so a price change is a keystroke.
//
// Percentages are stored as typed (75 means 75%). A blank cell counts as 0 in
// the maths but stays blank in storage.

export const BUDGET_INPUT_KEYS = [
  "leadsToCheck",
  "textableRate",
  "textsPerContact",
  "segmentsPerContact",
  "replyRate",
  "inboundSegmentsPerReply",
  "phoneNumbers",
  "lookupRate",
  "outboundRate",
  "carrierFee",
  "inboundRate",
  "numberMonthly",
  "a2pMonthly",
  "a2pOneTime",
] as const;

export type BudgetInputKey = (typeof BUDGET_INPUT_KEYS)[number];
export type BudgetInputs = Record<BudgetInputKey, number | null>;

export interface BudgetSubscription {
  name: string;
  amount: number | null;
}

export const BUDGET_DEFAULTS: BudgetInputs = {
  leadsToCheck: null,
  // 15 of the first 20 Detroit numbers were mobile or nonFixedVoip (2026-10-02).
  textableRate: 75,
  // cold-sms-pipeline/config/messages.txt: four texts, the last one is two
  // segments, so five segments for a contact who never replies.
  textsPerContact: 4,
  segmentsPerContact: 5,
  replyRate: 5,
  inboundSegmentsPerReply: 2,
  phoneNumbers: 1,
  lookupRate: 0.008,
  outboundRate: 0.0079,
  carrierFee: 0.004,
  inboundRate: 0.0079,
  numberMonthly: 1.15,
  a2pMonthly: 10,
  // One-time registration, typed only in the month it is paid.
  a2pOneTime: null,
};

export interface BudgetResult {
  contactsTexted: number;
  textsSent: number;
  segmentsOut: number;
  segmentsIn: number;
  lines: {
    lookup: number;
    outbound: number;
    carrier: number;
    inbound: number;
    numbers: number;
    a2p: number;
    subscriptions: number;
  };
  total: number;
  perContact: number | null;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function computeBudget(inputs: BudgetInputs, subs: BudgetSubscription[]): BudgetResult {
  const checked = n(inputs.leadsToCheck);
  // Whole people: 75% of 3 checked numbers is 2 contacts, not 2.25.
  const contactsTexted = Math.floor(checked * (n(inputs.textableRate) / 100));
  const textsSent = contactsTexted * n(inputs.textsPerContact);
  const segmentsOut = contactsTexted * n(inputs.segmentsPerContact);
  const segmentsIn = contactsTexted * (n(inputs.replyRate) / 100) * n(inputs.inboundSegmentsPerReply);

  const lines = {
    lookup: checked * n(inputs.lookupRate),
    outbound: segmentsOut * n(inputs.outboundRate),
    carrier: segmentsOut * n(inputs.carrierFee),
    inbound: segmentsIn * n(inputs.inboundRate),
    numbers: n(inputs.phoneNumbers) * n(inputs.numberMonthly),
    a2p: n(inputs.a2pMonthly) + n(inputs.a2pOneTime),
    subscriptions: subs.reduce((sum, s) => sum + n(s.amount), 0),
  };
  const total = Object.values(lines).reduce((sum, v) => sum + v, 0);

  return {
    contactsTexted,
    textsSent,
    segmentsOut,
    segmentsIn,
    lines,
    total,
    perContact: contactsTexted > 0 ? total / contactsTexted : null,
  };
}

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(/[$,%]/g, "");
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

// Only the known keys survive, each a number or null.
export function normalizeInputs(raw: unknown): BudgetInputs {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as BudgetInputs;
  for (const key of BUDGET_INPUT_KEYS) out[key] = toNumOrNull(src[key]);
  return out;
}

export function normalizeSubscriptions(raw: unknown): BudgetSubscription[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ name: String(s.name ?? "").trim(), amount: toNumOrNull(s.amount) }));
}

export interface BudgetRowLike {
  month: string; // "YYYY-MM-01"
  inputs: BudgetInputs;
  subscriptions: BudgetSubscription[];
}

// What the page shows for a month: its own saved row, or else a copy of the
// latest earlier month (minus the one-time A2P fee), or else the defaults.
// Nothing is written until a cell is typed in.
export function startingBudget(
  rows: BudgetRowLike[],
  month: string, // "YYYY-MM"
): { inputs: BudgetInputs; subscriptions: BudgetSubscription[]; saved: boolean } {
  const own = rows.find((r) => r.month.slice(0, 7) === month);
  if (own) return { inputs: { ...own.inputs }, subscriptions: [...own.subscriptions], saved: true };

  const earlier = rows
    .filter((r) => r.month.slice(0, 7) < month)
    .sort((a, b) => (a.month < b.month ? 1 : -1))[0];
  if (earlier) {
    return {
      inputs: { ...earlier.inputs, a2pOneTime: null },
      subscriptions: earlier.subscriptions.map((s) => ({ ...s })),
      saved: false,
    };
  }
  return { inputs: { ...BUDGET_DEFAULTS }, subscriptions: [], saved: false };
}
