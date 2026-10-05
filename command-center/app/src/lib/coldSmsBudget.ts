// Cold SMS > SMS Budget (Jake, 2026-10-05): the estimated monthly cost of
// cold SMS, at the bottom of the Cold SMS page. Shared by the page and the API
// route, so the server stores exactly the keys the page computes from.
//
// The chain: new businesses texted a day x send days = contacts texted. To
// find that many textable numbers, contacts / textable % go through Twilio
// Lookup. Each contact gets the whole sequence (segments per contact), a share
// reply. GHL bills every segment both ways, carriers add a fee on outbound.
//
// Defaults are Jake's answers on 2026-10-05 (500 a day, weekdays, 1 number,
// Low Volume Standard A2P, GHL plan not counted) and the published prices that
// day: Twilio Lookup Line Type Intelligence $0.008, LC Phone $0.0079 a segment
// each way, carrier fees $0.004 to $0.010 (low end used), number $1.15/mo,
// A2P Low Volume campaign $1.50/mo. Every one is a typed cell.
//
// Percentages are stored as typed (75 means 75%). A blank cell counts as 0 in
// the maths but stays blank in storage.

export const BUDGET_INPUT_KEYS = [
  "contactsPerDay",
  "sendDays",
  "phoneNumbers",
  "textableRate",
  "segmentsPerContact",
  "replyRate",
  "inboundSegmentsPerReply",
  "lookupRate",
  "outboundRate",
  "carrierFee",
  "inboundRate",
  "numberMonthly",
  "a2pMonthly",
  "a2pOneTime",
  "otherMonthly",
] as const;

export type BudgetInputKey = (typeof BUDGET_INPUT_KEYS)[number];
export type BudgetInputs = Record<BudgetInputKey, number | null>;

export const BUDGET_DEFAULTS: BudgetInputs = {
  contactsPerDay: 500,
  // Weekdays.
  sendDays: 22,
  phoneNumbers: 1,
  // 15 of the first 20 Detroit numbers were mobile or nonFixedVoip (2026-10-02).
  textableRate: 75,
  // cold-sms-pipeline/config/messages.txt: four texts, the last one is two
  // segments, so five segments for a contact who never replies.
  segmentsPerContact: 5,
  replyRate: 5,
  inboundSegmentsPerReply: 2,
  lookupRate: 0.008,
  outboundRate: 0.0079,
  carrierFee: 0.004,
  inboundRate: 0.0079,
  numberMonthly: 1.15,
  a2pMonthly: 1.5,
  // One-time registration, typed only in the month it is paid.
  a2pOneTime: null,
  otherMonthly: null,
};

export interface BudgetResult {
  contactsTexted: number;
  lookups: number;
  segmentsOut: number;
  segmentsIn: number;
  lines: {
    lookup: number;
    texts: number;
    carrier: number;
    replies: number;
    numbers: number;
    a2p: number;
    other: number;
  };
  total: number;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function computeBudget(inputs: BudgetInputs): BudgetResult {
  const contactsTexted = n(inputs.contactsPerDay) * n(inputs.sendDays);
  const textable = n(inputs.textableRate) / 100;
  // Whole lookups: to end with 2 textable numbers at 75% you check 3.
  const lookups = textable > 0 ? Math.ceil(contactsTexted / textable) : 0;
  const segmentsOut = contactsTexted * n(inputs.segmentsPerContact);
  const segmentsIn = contactsTexted * (n(inputs.replyRate) / 100) * n(inputs.inboundSegmentsPerReply);

  const lines = {
    lookup: lookups * n(inputs.lookupRate),
    texts: segmentsOut * n(inputs.outboundRate),
    carrier: segmentsOut * n(inputs.carrierFee),
    replies: segmentsIn * n(inputs.inboundRate),
    numbers: n(inputs.phoneNumbers) * n(inputs.numberMonthly),
    a2p: n(inputs.a2pMonthly) + n(inputs.a2pOneTime),
    other: n(inputs.otherMonthly),
  };
  const total = Object.values(lines).reduce((sum, v) => sum + v, 0);

  return { contactsTexted, lookups, segmentsOut, segmentsIn, lines, total };
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

export interface BudgetRowLike {
  month: string; // "YYYY-MM-01"
  inputs: BudgetInputs;
}

// What the page shows for a month: its own saved row, or else a copy of the
// latest earlier month (minus the one-time A2P fee), or else the defaults.
// Nothing is written until a cell is typed in.
export function startingBudget(rows: BudgetRowLike[], month: string /* "YYYY-MM" */): BudgetInputs {
  const own = rows.find((r) => r.month.slice(0, 7) === month);
  if (own) return { ...own.inputs };

  const earlier = rows
    .filter((r) => r.month.slice(0, 7) < month)
    .sort((a, b) => (a.month < b.month ? 1 : -1))[0];
  if (earlier) return { ...earlier.inputs, a2pOneTime: null };
  return { ...BUDGET_DEFAULTS };
}
