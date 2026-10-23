// What a brief card does to a Mission Control page when Jake approves it
// (docs/build-plans/hermes-agent-ops.md, Phase 2). The Ads and Research agents
// propose additions as a `brief` card with payload.pageOps; Approve applies
// exactly those ops to the client's page, so the page only ever holds what
// Jake said yes to. Shared by the card (one line per op) and decideItem.
//
// parsePageOps checks the shape before the card moves (a bad card stays
// waiting, 422). applyPageOps runs against the page as it is now and is all or
// nothing: one op that misses (no such campaign, a name already there) and
// nothing is written. Pure.

import { FUNNEL_STAGES, parsePage, type AdsPage, type BriefPageId, type ResearchPage } from "./briefPages";

export type AdsKind = "campaign" | "adSet" | "creative" | "angle" | "ad" | "headline";
export type ResearchKind = "competitor" | "painPoint" | "goal" | "benefit" | "angle" | "offer" | "funnel";
export type PageKind = AdsKind | ResearchKind;

export const CAMPAIGN_FIELDS = ["offer", "objective", "dailySpend", "budgetType", "launchDate"] as const;
export type CampaignField = (typeof CAMPAIGN_FIELDS)[number];

export const RESEARCH_FIELDS = ["sourcesNote"] as const;
export type ResearchField = (typeof RESEARCH_FIELDS)[number];

type Value = string | number | null;
// A review quote as an op carries it; parsePage cleans it on the way in.
type QuoteIn = { text: string; stars: number | null; from: string };
type Fields = Record<string, Value | boolean | QuoteIn[]>;

// campaign names the campaign for every Ads kind but campaign and headline.
export type PageOp =
  | { op: "set"; field: string; value: Value; campaign?: string }
  | { op: "add"; kind: PageKind; fields: Fields; campaign?: string }
  | { op: "update"; kind: PageKind; name: string; fields: Fields; campaign?: string }
  | { op: "remove"; kind: PageKind; name: string; campaign?: string };

const MAX_OPS = 30;
const MAX_TEXT = 5000;

// Each kind's fields, which one names a row (what update and remove match on),
// and which are numbers. Status is not here: an added angle or ad is approved
// by the Approve that adds it, and later moves go through the page block.
interface KindSpec {
  key: string;
  text: string[];
  num: string[];
  bool?: string[];
  // Fields that hold a list of review quotes ({text, stars, from}).
  quotes?: string[];
  // Text fields that take one of a few values.
  oneOf?: Record<string, readonly string[]>;
  label: string;
}
const ADS_KINDS: Record<AdsKind, KindSpec> = {
  campaign: { key: "name", text: ["name", "offer", "objective", "budgetType", "launchDate"], num: ["dailySpend"], label: "campaign" },
  adSet: { key: "name", text: ["name", "targeting", "form"], num: [], label: "ad set" },
  creative: { key: "type", text: ["type", "note"], num: ["count"], label: "creative" },
  angle: { key: "name", text: ["name", "pitch"], num: [], label: "angle" },
  ad: { key: "name", text: ["name", "type", "angle", "headline", "primaryText", "adSet"], num: [], label: "ad" },
  headline: { key: "text", text: ["text", "angle"], num: [], label: "headline" },
};
const RESEARCH_KINDS: Record<ResearchKind, KindSpec> = {
  competitor: { key: "name", text: ["name", "offer", "websiteUrl"], num: ["googleRating", "googleReviews"], bool: ["isClient"], label: "competitor" },
  painPoint: { key: "title", text: ["title"], num: ["reviews"], quotes: ["quotes"], label: "pain point" },
  goal: { key: "title", text: ["title"], num: ["reviews"], quotes: ["quotes"], label: "goal" },
  benefit: { key: "benefit", text: ["benefit", "dimensionalized"], num: [], quotes: ["quotes"], label: "benefit" },
  angle: { key: "name", text: ["name"], num: ["reviews"], quotes: ["quotes"], label: "angle" },
  offer: { key: "offer", text: ["offer"], num: [], label: "offer" },
  funnel: { key: "name", text: ["name", "stage", "quote"], num: [], oneOf: { stage: FUNNEL_STAGES }, label: "funnel angle" },
};
const RESEARCH_LISTS: Record<ResearchKind, keyof ResearchPage> = {
  competitor: "competitors",
  painPoint: "painPoints",
  goal: "goals",
  benefit: "benefits",
  angle: "angles",
  offer: "offers",
  funnel: "funnel",
};

const kindsFor = (page: BriefPageId): Record<string, KindSpec> => (page === "ads" ? ADS_KINDS : RESEARCH_KINDS);
// The Ads kinds that live inside a campaign.
const inCampaign = (page: BriefPageId, kind: PageKind) => page === "ads" && kind !== "campaign" && kind !== "headline";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const MAX_QUOTES = 3;

function cleanQuotes(k: string, v: unknown): QuoteIn[] | string {
  if (!Array.isArray(v) || v.length > MAX_QUOTES) return `${k} must be a list of at most ${MAX_QUOTES} quotes`;
  const out: QuoteIn[] = [];
  for (const q of v) {
    if (!isObj(q) || typeof q.text !== "string" || !q.text.trim()) return `each of ${k} needs text, the review's own words`;
    if (q.stars !== undefined && q.stars !== null && !(typeof q.stars === "number" && q.stars >= 1 && q.stars <= 5)) return "stars must be 1 to 5";
    out.push({ text: q.text.slice(0, MAX_TEXT), stars: typeof q.stars === "number" ? q.stars : null, from: typeof q.from === "string" ? q.from.slice(0, 200) : "" });
  }
  return out;
}

function cleanFields(spec: KindSpec, raw: unknown): Fields | string {
  if (!isObj(raw)) return "fields must be an object";
  const out: Fields = {};
  for (const [k, v] of Object.entries(raw)) {
    if (spec.quotes?.includes(k)) {
      const q = cleanQuotes(k, v);
      if (typeof q === "string") return q;
      out[k] = q;
    } else if (spec.oneOf?.[k]) {
      if (typeof v !== "string" || !spec.oneOf[k].includes(v)) return `${k} must be one of ${spec.oneOf[k].join(", ")}`;
      out[k] = v;
    } else if (spec.bool?.includes(k)) {
      if (typeof v !== "boolean") return `${k} must be true or false`;
      out[k] = v;
    } else if (spec.text.includes(k)) {
      // null is how the agents say "none found" (a shop with no offer); the
      // page keeps that as empty text. A null name still fails the add check.
      if (v === null) out[k] = "";
      else if (typeof v === "string") out[k] = v.slice(0, MAX_TEXT);
      else if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
      else return `${k} must be text`;
    } else if (spec.num.includes(k)) {
      if (v === null || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
      else return `${k} must be a number or null`;
    } else return `unknown field ${k}`;
  }
  return out;
}

/** A brief card's ops, checked before Jake's Approve can apply them. */
export function parsePageOps(page: BriefPageId, raw: unknown): { ok: true; ops: PageOp[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: "pageOps must be a list of at least one op" };
  if (raw.length > MAX_OPS) return { ok: false, error: `at most ${MAX_OPS} ops` };
  const kinds = kindsFor(page);
  const ops: PageOp[] = [];
  for (const [i, r] of raw.entries()) {
    const o = isObj(r) ? r : {};
    const bad = (why: string) => ({ ok: false as const, error: `op ${i + 1}: ${why}` });
    const campaign = o.campaign === undefined ? undefined : str(o.campaign);
    if (campaign === null) return bad("campaign must be a name");
    const at = campaign !== undefined ? { campaign } : {};

    if (o.op === "set") {
      const field = o.field as string;
      const allowed: readonly string[] = page === "ads" ? CAMPAIGN_FIELDS : RESEARCH_FIELDS;
      if (!allowed.includes(field)) return bad(`set field must be one of ${allowed.join(", ")}`);
      const v = o.value;
      const numeric = field === "dailySpend";
      if (numeric ? !(v === null || (typeof v === "number" && Number.isFinite(v))) : typeof v !== "string") {
        return bad(`${field} must be ${numeric ? "a number or null" : "text"}`);
      }
      ops.push({ op: "set", field, value: typeof v === "string" ? v.slice(0, MAX_TEXT) : (v as number | null), ...at });
      continue;
    }

    if (o.op !== "add" && o.op !== "update" && o.op !== "remove") return bad("op must be set, add, update or remove");
    const kind = o.kind as PageKind;
    const spec = kinds[kind as string];
    if (!spec) return bad(`kind must be one of ${Object.keys(kinds).join(", ")}`);
    if (o.campaign !== undefined && !inCampaign(page, kind)) return bad(`a ${spec.label} is not inside a campaign`);

    if (o.op === "add") {
      const fields = cleanFields(spec, o.fields);
      if (typeof fields === "string") return bad(fields);
      if (!str(fields[spec.key])) return bad(`add ${spec.label} needs ${spec.key}`);
      ops.push({ op: "add", kind, fields, ...at });
      continue;
    }
    const name = str(o.name);
    if (!name) return bad(`${o.op} needs the ${spec.label}'s ${spec.key} in name`);
    if (o.op === "remove") {
      ops.push({ op: "remove", kind, name, ...at });
      continue;
    }
    const fields = cleanFields(spec, o.fields);
    if (typeof fields === "string") return bad(fields);
    if (!Object.keys(fields).length) return bad("update needs fields");
    ops.push({ op: "update", kind, name, fields, ...at });
  }
  return { ok: true, ops };
}

const clip = (s: string, max = 80) => (s.length > max ? `${s.slice(0, max - 3)}...` : s);
const LABEL: Record<string, string> = {
  dailySpend: "daily spend",
  budgetType: "budget type",
  launchDate: "launch date",
  sourcesNote: "sources",
};

/** One short line per op, for the card and for the follow-up. */
export function pageOpLine(page: BriefPageId, op: PageOp): string {
  const where = op.campaign ? ` (${op.campaign})` : "";
  if (op.op === "set") {
    const v = op.value === null ? "unknown" : op.field === "dailySpend" ? `$${op.value}/day` : String(op.value);
    return `Set ${LABEL[op.field] ?? op.field}: ${clip(v)}${where}`;
  }
  const spec = kindsFor(page)[op.kind];
  if (op.op === "add") return `Add ${spec.label}: ${clip(String(op.fields[spec.key]))}${where}`;
  if (op.op === "remove") return `Remove ${spec.label}: ${clip(op.name)}${where}`;
  const renamed = op.fields[spec.key];
  const what = Object.keys(op.fields).filter((k) => k !== spec.key);
  const bits = [renamed && !same(String(renamed), op.name) ? `rename to ${clip(String(renamed), 40)}` : "", what.length ? what.join(", ") : ""].filter(Boolean);
  return `Change ${spec.label}: ${clip(op.name)}${bits.length ? `, ${bits.join(", ")}` : ""}${where}`;
}

/** The card's lines, or none when the ops do not parse (the card shows its plan). */
export function briefOpLines(page: BriefPageId | null, raw: unknown): string[] {
  if (!page) return [];
  const parsed = parsePageOps(page, raw);
  return parsed.ok ? parsed.ops.map((o) => pageOpLine(page, o)) : [];
}

// ---- applying ----

type RowList = Obj[];

function listFor(page: BriefPageId, data: Obj, op: Exclude<PageOp, { op: "set" }>): RowList | string {
  if (page === "research") return data[RESEARCH_LISTS[op.kind as ResearchKind]] as RowList;
  if (op.kind === "campaign") return data.campaigns as RowList;
  if (op.kind === "headline") return data.headlines as RowList;
  const camp = findCampaign(data, op.campaign);
  if (typeof camp === "string") return camp;
  const key = op.kind === "adSet" ? "adSets" : op.kind === "creative" ? "creatives" : op.kind === "angle" ? "angles" : "ads";
  return camp[key] as RowList;
}

const ads0 = (fields: Fields) => (parsePage("ads", { campaigns: [fields] }) as { ok: true; data: AdsPage }).data.campaigns[0];

// A campaign by name, or the only one when the op names none.
function findCampaign(data: Obj, name: string | undefined): Obj | string {
  const all = data.campaigns as RowList;
  if (name === undefined) {
    if (all.length === 1) return all[0];
    return all.length ? "name the campaign" : "no campaign yet: add one first";
  }
  return all.find((c) => same(String(c.name), name)) ?? `no campaign named ${name}`;
}

/**
 * The page with the ops applied, cleaned by parsePage, and a line per op.
 * Added angles and ads land approved: the Approve that applies them is the
 * approval.
 */
export function applyPageOps(
  page: BriefPageId,
  current: AdsPage | ResearchPage,
  ops: PageOp[],
): { ok: true; data: AdsPage | ResearchPage; summary: string[] } | { ok: false; error: string } {
  const data = JSON.parse(JSON.stringify(current)) as Obj;
  const spec = kindsFor(page);
  for (const [i, op] of ops.entries()) {
    const bad = (why: string) => ({ ok: false as const, error: `op ${i + 1}: ${why}` });
    if (op.op === "set") {
      if (page === "ads") {
        const camp = findCampaign(data, op.campaign);
        if (typeof camp === "string") return bad(camp);
        camp[op.field] = op.value;
      } else data[op.field] = op.value;
      continue;
    }
    const s = spec[op.kind];
    const list = listFor(page, data, op);
    if (typeof list === "string") return bad(list);
    const name = op.op === "add" ? String(op.fields[s.key]) : op.name;
    const at = list.findIndex((r) => same(String(r[s.key] ?? ""), name));
    if (op.op === "add") {
      if (at >= 0) return bad(`${s.label} ${name} is already there`);
      // A new campaign gets its empty lists now, so a later op in the same
      // card can add an ad set or an angle to it.
      const row: Obj = op.kind === "campaign" ? { ...(ads0(op.fields) as unknown as Obj) } : { ...op.fields };
      if (page === "ads" && (op.kind === "angle" || op.kind === "ad")) row.status = "approved";
      list.push(row);
      continue;
    }
    if (at < 0) return bad(`no ${s.label} named ${name}`);
    if (op.op === "remove") list.splice(at, 1);
    else {
      const next: Obj = { ...list[at], ...op.fields };
      const clash = list.findIndex((r, j) => j !== at && same(String(r[s.key] ?? ""), String(next[s.key] ?? "")));
      if (clash >= 0) return bad(`${s.label} ${String(next[s.key])} is already there`);
      list[at] = next;
    }
  }
  const parsed = parsePage(page, data);
  if (!parsed.ok) return { ok: false, error: parsed.reason };
  return { ok: true, data: parsed.data, summary: ops.map((o) => pageOpLine(page, o)) };
}

// ---- what changed, for the panel's highlight ----

const rowKey = (spec: KindSpec, r: Obj) => String(r[spec.key] ?? "").trim().toLowerCase();

function diffRows(prefix: string, spec: KindSpec, before: RowList, after: RowList, out: Set<string>): void {
  for (const r of after) {
    const k = rowKey(spec, r);
    const old = before.find((b) => rowKey(spec, b) === k);
    if (!old || JSON.stringify(old) !== JSON.stringify(r)) out.add(`${prefix}${k}`.toLowerCase());
  }
}

/**
 * The parts of a page that are new or different between two reads, as keys
 * the page components look up: `campaign|field`, `campaign|kind|name`,
 * `headline|text`, `angle|mold`, `sourcesnote` and so on. Lowercased.
 */
export function freshKeys(page: BriefPageId, before: AdsPage | ResearchPage, after: AdsPage | ResearchPage): Set<string> {
  const out = new Set<string>();
  if (page === "ads") {
    const b = before as AdsPage;
    const a = after as AdsPage;
    for (const c of a.campaigns) {
      const name = c.name.trim().toLowerCase();
      const old = b.campaigns.find((x) => x.name.trim().toLowerCase() === name);
      for (const f of CAMPAIGN_FIELDS) if (!old || old[f] !== c[f]) out.add(`${name}|${f}`.toLowerCase());
      diffRows(`${name}|adSet|`, ADS_KINDS.adSet, old?.adSets ?? [], c.adSets, out);
      diffRows(`${name}|creative|`, ADS_KINDS.creative, old?.creatives ?? [], c.creatives, out);
      diffRows(`${name}|angle|`, ADS_KINDS.angle, old?.angles ?? [], c.angles, out);
      diffRows(`${name}|ad|`, ADS_KINDS.ad, old?.ads ?? [], c.ads, out);
    }
    diffRows("headline|", ADS_KINDS.headline, b.headlines, a.headlines, out);
    return out;
  }
  const b = before as ResearchPage;
  const a = after as ResearchPage;
  for (const [kind, list] of Object.entries(RESEARCH_LISTS) as [ResearchKind, keyof ResearchPage][]) {
    diffRows(`${kind}|`, RESEARCH_KINDS[kind], b[list] as unknown as RowList, a[list] as unknown as RowList, out);
  }
  if (a.sourcesNote !== b.sourcesNote) out.add("sourcesnote");
  return out;
}
