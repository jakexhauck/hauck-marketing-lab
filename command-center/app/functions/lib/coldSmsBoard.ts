// Cold SMS > Pipeline: the pure parts.
//
// The board is the agency's "Cold SMS" pipeline in GoHighLevel, read live. GHL's
// own workflow moves a prospect to Replied when they text back; what GHL cannot
// do is tell "yes, how much?" from "stop texting me". Claude reads each reply and
// stamps a verdict on the card, and the sort below moves Replied cards on by it:
// positive to Positive Reply, negative and stop to Negative Reply, check stays
// for Jake (Jake, 2026-10-13; it only labelled before).
//
// Pure, so the verdict guard, the zone guess and the variation pick are unit
// tested without GHL or Claude.

import { writeWithClaude, CLAUDE_SMALL_MODEL, type ClaudeCreate, sdkCreate } from "./claude";
import { ZONE_BY_AREA_CODE, areaCodeOf } from "./leadZones";

export const COLD_SMS_PIPELINE = /cold\s*sms/i;
export const COLD_SMS_CALENDAR = /cold\s*sms/i;
const DEMO_CALENDAR = /demo/i;

// The calendar the wizard books into: one named for Cold SMS when it exists,
// otherwise the agency's demo calendar. The fallback is deliberate: on
// 2026-10-12 the per-channel demo calendars ("Demo Call - Cold SMS", "- Cold
// Call", "- B2B Ads") were folded into one "Hauck Marketing Demo Call", and a
// prospect who said yes must still be bookable.
export function pickColdSmsCalendar<T extends { name?: string }>(calendars: T[]): T | null {
  return (
    calendars.find((c) => COLD_SMS_CALENDAR.test(c.name ?? "")) ??
    calendars.find((c) => DEMO_CALENDAR.test(c.name ?? "")) ??
    null
  );
}

// The Composio user id Jake's own Google Calendar is linked under for the
// booking wizard. Not a tenant key (those are "live:<slug>"), so it can never
// resolve to a client's calendar.
export const AGENCY_GCAL_USER = "agency:cold-sms";

export const VERDICTS = ["positive", "negative", "stop", "check"] as const;
export type Verdict = (typeof VERDICTS)[number];

export function isVerdict(v: unknown): v is Verdict {
  return typeof v === "string" && (VERDICTS as readonly string[]).includes(v);
}

// The script variation a prospect was sent rides on the contact as a tag
// ("sms v2"). The first one wins; a contact re-imported under a second script
// keeps the tag it was first texted with at the front of GHL's list.
export function variationOf(tags: string[] | undefined | null): string | null {
  for (const t of tags ?? []) {
    const m = /^sms\s*v\s*(\d+)$/i.exec(t.trim());
    if (m) return `sms v${m[1]}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Which zone the prospect lives in, for the booking wizard's "their time".
//
// Best source first: a timezone already on the GHL contact, then the state on
// the contact, then the phone's area code. Each answer says where it came from
// so the wizard can mark a guess as a guess.

const STATE_ZONE: Record<string, string> = {
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York",
  GA: "America/New_York", IN: "America/New_York", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/New_York", NH: "America/New_York", NJ: "America/New_York",
  NY: "America/New_York", NC: "America/New_York", OH: "America/New_York", PA: "America/New_York",
  RI: "America/New_York", SC: "America/New_York", VT: "America/New_York", VA: "America/New_York",
  WV: "America/New_York", KY: "America/New_York",
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago",
  KS: "America/Chicago", LA: "America/Chicago", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", NE: "America/Chicago", ND: "America/Chicago", OK: "America/Chicago",
  SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", WI: "America/Chicago",
  CO: "America/Denver", ID: "America/Denver", MT: "America/Denver", NM: "America/Denver",
  UT: "America/Denver", WY: "America/Denver",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  AK: "America/Anchorage", HI: "Pacific/Honolulu",
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

export type ZoneSource = "contact" | "state" | "area_code";

export interface ProspectZone {
  zone: string | null;
  source: ZoneSource | null;
}

function isValidZone(z: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

export function stateCode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^[a-z]{2}$/i.test(s)) {
    const up = s.toUpperCase();
    return STATE_ZONE[up] ? up : null;
  }
  return STATE_NAMES[s.toLowerCase()] ?? null;
}

export function prospectZone(input: {
  timezone?: string | null;
  state?: string | null;
  phone?: string | null;
}): ProspectZone {
  const tz = (input.timezone ?? "").trim();
  if (tz && isValidZone(tz)) return { zone: tz, source: "contact" };
  const st = stateCode(input.state);
  if (st) return { zone: STATE_ZONE[st], source: "state" };
  const ac = areaCodeOf(input.phone ?? "");
  const byArea = ac ? ZONE_BY_AREA_CODE[ac] : undefined;
  if (byArea) return { zone: byArea, source: "area_code" };
  return { zone: null, source: null };
}

// ---------------------------------------------------------------------------
// Claude's read of a reply.

export interface ReplyToClassify {
  key: string; // contact id
  reply: string;
  ourText?: string | null; // the cold text they are answering, when known
}

export interface ClassifiedReply {
  key: string;
  verdict: Verdict;
}

const SYSTEM = `You sort replies to cold text messages. A marketing agency texted local service businesses (garage door companies, contractors) offering to get them more jobs with Facebook ads. Each item is one business owner's latest reply.

Label each reply with exactly one verdict:
- "positive": any interest or openness. Asks the price or says it comes down to cost, asks how it works, says call me, yes, sure, gives a time, asks for info, says they could take more work.
- "negative": a no, however it is worded. Not interested, no thanks, we're good, we're busy, already have someone, don't do that kind of work, not paying for leads. A long or rude "not interested" is still "negative".
- "stop": ONLY an explicit opt-out or abuse. The word STOP or unsubscribe, "remove me", "take me off your list", "don't text me again", swearing at us, threatening to report.
- "check": cannot tell. Only "who is this?" with no other signal, a single emoji or reaction, an unrelated message, an auto-reply, or a picture.

Judge the reply itself. Do not be optimistic: if it is genuinely unclear, use "check".`;

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          verdict: { type: "string", enum: [...VERDICTS] },
        },
        required: ["key", "verdict"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

interface ClaudeAnswer {
  results: { key: string; verdict: Verdict }[];
}

function isAnswer(v: unknown): v is ClaudeAnswer {
  if (!v || typeof v !== "object") return false;
  const r = (v as { results?: unknown }).results;
  return (
    Array.isArray(r) &&
    r.every(
      (x) => x && typeof x === "object" && typeof (x as { key?: unknown }).key === "string" &&
        isVerdict((x as { verdict?: unknown }).verdict),
    )
  );
}

// One Claude call for a whole batch: a board load with ten new replies is one
// request, not ten. Returns only keys Claude answered for and that were asked;
// anything missing stays unlabelled and is retried on the next load.
export async function classifyReplies(
  env: { ANTHROPIC_API_KEY?: string },
  items: ReplyToClassify[],
  create: ClaudeCreate = sdkCreate,
): Promise<ClassifiedReply[]> {
  if (items.length === 0) return [];
  const input = JSON.stringify(
    items.map((i) => ({ key: i.key, our_text: i.ourText ?? undefined, reply: i.reply.slice(0, 600) })),
  );
  const res = await writeWithClaude<ClaudeAnswer>(
    env,
    { system: SYSTEM, input, schema: SCHEMA, check: isAnswer, model: CLAUDE_SMALL_MODEL, maxTokens: 8000 },
    create,
  );
  if (!res.ok) {
    console.warn("[coldSmsBoard] classify failed:", res.error);
    return [];
  }
  const asked = new Set(items.map((i) => i.key));
  const out = new Map<string, Verdict>();
  for (const r of res.data.results) if (asked.has(r.key) && !out.has(r.key)) out.set(r.key, r.verdict);
  return [...out].map(([key, verdict]) => ({ key, verdict }));
}

// The stamp that says which reply a stored verdict was for. The newest inbound
// message's date is enough: a new reply moves it, our own texts do not.
export function replyKey(lastInboundAt: string | number | null | undefined): string | null {
  if (lastInboundAt == null || lastInboundAt === "") return null;
  const ms = typeof lastInboundAt === "number" ? lastInboundAt : +new Date(lastInboundAt);
  return Number.isFinite(ms) ? String(ms) : null;
}

// The auto-sort rule lives in coldSmsSort.ts so the board can run it in the
// browser too (cards move on screen the moment a verdict is known).
export { autoSortMoves, findSortStages, findTrashStages, type SortStages } from "./coldSmsSort";
