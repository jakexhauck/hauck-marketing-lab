import type { Env } from "./env";
import { ghlJson, type GhlContext } from "./ghl";
import { segmentInfo } from "../../src/lib/smsRules";
import { computeBudget, type BudgetInputs } from "../../src/lib/coldSmsBudget";

// What cold SMS actually cost this month, tracked automatically (Jake,
// 2026-10-06). Two sources:
//
//   Texts   LC Phone bills per segment inside GHL, and GHL exposes no wallet
//           charges. So the app counts every text on the Cold SMS number from
//           GHL's message export (out, and replies in), counts segments from
//           each body, and prices them at the SMS Budget's own rates. Close,
//           not an invoice.
//   Lookup  Jake's own Twilio account. Twilio's usage API returns the real
//           dollar figure, so this one is exact.
//
// The number and A2P fees are flat, taken from the same SMS Budget month.
//
// Counts are kept per UTC day in cold_sms_cost_daily (0145) so a page view only
// pulls the days it has not seen. Free-plan Workers cap subrequests at 50 a
// request, and a busy day is several export pages, so one call syncs at most
// PAGE_BUDGET pages and says how many days are still pending.

// The agency's "Cold SMS" LC Phone number (GHL > Phone Numbers, added
// 2026-10-01). COLD_SMS_FROM_NUMBER overrides it if the number ever changes.
export const DEFAULT_COLD_SMS_NUMBER = "+13133517535";

export const PAGE_BUDGET = 25;
const PAGE_SIZE = 500;

export interface ExportMessage {
  direction?: string;
  status?: string;
  body?: string;
  from?: string;
  to?: string;
}

export interface DayTally {
  outCount: number;
  outSegments: number;
  inCount: number;
  inSegments: number;
}

export function coldSmsNumber(env: Env): string {
  return (env.COLD_SMS_FROM_NUMBER ?? "").trim() || DEFAULT_COLD_SMS_NUMBER;
}

// Texts sent FROM the number and replies sent TO it. A "failed" text never
// left the carrier gateway and is not billed; "undelivered" was, so it counts.
export function tallyMessages(messages: ExportMessage[], number: string): DayTally {
  const t: DayTally = { outCount: 0, outSegments: 0, inCount: 0, inSegments: 0 };
  for (const m of messages) {
    if (m.status === "failed") continue;
    const segments = segmentInfo(m.body ?? "").segments;
    if (m.direction === "outbound" && m.from === number) {
      t.outCount += 1;
      t.outSegments += segments;
    } else if (m.direction === "inbound" && m.to === number) {
      t.inCount += 1;
      t.inSegments += segments;
    }
  }
  return t;
}

export function addTallies(a: DayTally, b: DayTally): DayTally {
  return {
    outCount: a.outCount + b.outCount,
    outSegments: a.outSegments + b.outSegments,
    inCount: a.inCount + b.inCount,
    inSegments: a.inSegments + b.inSegments,
  };
}

export const EMPTY_TALLY: DayTally = { outCount: 0, outSegments: 0, inCount: 0, inSegments: 0 };

// Every UTC day of `month` (YYYY-MM) up to and including `today` (YYYY-MM-DD).
export function daysToCount(month: string, today: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d += 1) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    if (day > today) break;
    out.push(day);
  }
  return out;
}

// A day is final once it was synced three days after it ended. Until then it
// is re-pulled on every sync: late delivery-status updates land, and GHL's
// export has been seen answering a day empty once and whole a minute later
// (2026-10-06), so one bad answer cannot freeze a day.
export function isFinal(day: string, syncedAt: string): boolean {
  const end = Date.parse(`${day}T00:00:00Z`) + 4 * 24 * 3600 * 1000;
  return Date.parse(syncedAt) >= end;
}

export interface CostLines {
  texts: number;
  replies: number;
  fixed: number;
  total: number;
}

// Prices the counted segments with the month's SMS Budget rates. Lookup is
// added separately because it is Twilio's own figure.
export function priceTally(t: DayTally, inputs: BudgetInputs): CostLines {
  const n = (v: number | null) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const texts = t.outSegments * (n(inputs.outboundRate) + n(inputs.carrierFee));
  const replies = t.inSegments * (n(inputs.inboundRate) + n(inputs.carrierFeeIn));
  const lines = computeBudget(inputs).lines;
  const fixed = lines.numbers + lines.a2p;
  return { texts, replies, fixed, total: texts + replies + fixed };
}

interface ExportPage {
  messages?: ExportMessage[];
  nextCursor?: string | null;
  total?: number;
}

// Pulls one UTC day of SMS. Returns null when the page budget ran out first,
// so a half-counted day is never stored as if it were whole.
export async function fetchDay(
  ctx: GhlContext,
  day: string,
  budget: { pages: number },
): Promise<ExportMessage[] | null> {
  const all: ExportMessage[] = [];
  let cursor: string | null = null;
  let expected: number | null = null;
  do {
    if (budget.pages <= 0) return null;
    budget.pages -= 1;
    const q = new URLSearchParams({
      locationId: ctx.locationId,
      channel: "SMS",
      startDate: `${day}T00:00:00.000Z`,
      endDate: `${day}T23:59:59.999Z`,
      limit: String(PAGE_SIZE),
    });
    if (cursor) q.set("cursor", cursor);
    const page: ExportPage = await ghlJson<ExportPage>(ctx, `/conversations/messages/export?${q}`);
    const messages = page.messages ?? [];
    if (expected === null && typeof page.total === "number") expected = page.total;
    all.push(...messages);
    cursor = messages.length === PAGE_SIZE && page.nextCursor ? page.nextCursor : null;
  } while (cursor);
  // GHL states the day's total on every page. Fewer rows than that is a short
  // answer, and storing it would undercount the day.
  if (expected !== null && all.length < expected) {
    throw new Error(`GHL export for ${day} returned ${all.length} of ${expected}`);
  }
  return all;
}

export interface LookupCost {
  count: number;
  cost: number;
}

// Twilio Lookup for the month, exact. Null when Twilio is not configured or
// does not answer, so the page can say "not connected" instead of $0.
export async function fetchLookupCost(env: Env, month: string): Promise<LookupCost | null> {
  const sid = (env.TWILIO_ACCOUNT_SID ?? "").trim();
  const token = (env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!sid || !token) return null;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const q = new URLSearchParams({
    Category: "lookups",
    StartDate: `${month}-01`,
    EndDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records.json?${q}`, {
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { usage_records?: { count?: string; price?: string }[] };
  let count = 0;
  let cost = 0;
  for (const r of json.usage_records ?? []) {
    count += Number(r.count) || 0;
    cost += Number(r.price) || 0;
  }
  return { count, cost };
}
