import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId } from "../../src/lib/agents";
import type { AgentMessage } from "../../src/lib/agentWire";
import { logAdminAction } from "./adminAuth";
import { isUuid } from "./agentItems";
import { messageFromRow } from "./agentRunner";
import { GRAPH, graphGet, graphGetAll } from "./metaGraph";
import { normalizeAccount, uploadAdImage } from "./metaUpload";

// What the Ads Agent can change in a client's Meta ad account, and when
// (docs/build-plans/agents.md, Phase 7: "controls plus").
//
// The agent reaches Meta writes only through the runner's bin/metaops.mjs,
// which posts here (api/agent-runner/meta-ops.ts). The insights reads stay in
// api/agent-runner/meta.ts, which imports none of this. Everything that
// matters is enforced in this file, never in the agent's instructions:
//
//   - An op is a name from META_OPS or a 400. No raw path or field from the
//     agent: each op builds its own request. No deletes, no new campaigns,
//     ad sets, audiences or targeting.
//   - Every op, read or write, must come from a RUNNING `me` message in an
//     Ads Agent chat at the same client the call names.
//   - A write needs an approved `meta` grant on the Ads Agent's own card, and
//     the exact op and args must be in that card's payload.ops (Approve checks
//     the payload hash, so these are the ops Jake saw). Unlike GHL there is NO
//     direct-ask path: a typed message alone never changes Ads Manager.
//   - Before anything is sent, the live object is read back: it must sit in
//     THIS client's ad account, its name must be the name on the card, and a
//     budget must still be the card's `from` (else the card is stale). The
//     token must hold ads_management.
//   - A daily budget may not rise past 3x the current one, or past $500/day,
//     in one change. A bigger move is split over cards.
//   - The write is logged in admin_audit_log as `agent:meta.<op>` BEFORE it
//     is sent. If the log cannot be saved, nothing is sent.
//
// Only the agency System User token is used (deps.token, which the endpoint
// wires to resolveMetaToken). Page tokens are never fetched here.

type Row = Record<string, unknown>;

export type MetaOpName = "read.structure" | "read.creatives" | "read.library" | "pause" | "resume" | "dailyBudget" | "createAd";

/** Jake's guard on one budget change (his call: constants, the card can be split). */
export const BUDGET_MAX_FACTOR = 3;
export const BUDGET_MAX_CENTS = 50_000;

export class MetaOpRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 409 | 503,
    message: string,
  ) {
    super(message);
  }
}

type Parsed<A> = { ok: true; args: A } | { ok: false; error: string };

export interface MetaCallDeps {
  /** The agency System User token, or null when Meta is not connected. */
  token(): Promise<string | null>;
  /** A Creatives file's bytes from the ad-creatives bucket. */
  download(path: string): Promise<Blob>;
}

interface Ctx {
  client: SupabaseClient;
  tenantId: string;
  token: string;
  account: string; // act_123
  accountNum: string; // 123
  pageId: string | null;
  deps: MetaCallDeps;
}

interface Op<A> {
  write: boolean;
  parse(args: Row): Parsed<A>;
  // Live reads and refusals. Nothing in check may change anything at Meta.
  check(ctx: Ctx, args: A): Promise<unknown>;
  // The change itself, given what check found. Writes only.
  send?(ctx: Ctx, args: A, checked: unknown): Promise<unknown>;
}

type Level = "campaign" | "adset" | "ad";
const LEVELS: Level[] = ["campaign", "adset", "ad"];
const LEVEL_WORD: Record<Level, string> = { campaign: "campaign", adset: "ad set", ad: "ad" };
// A field only that kind of object has, so an id of the wrong kind is a Meta
// error, not a change to something else.
const LEVEL_FIELD: Record<Level, string> = { campaign: "buying_type", adset: "billing_event", ad: "adset_id" };

// Meta object ids are digits. Anything else could steer the path.
const META_ID = /^\d{1,30}$/;
const id = (v: unknown): string | null => (typeof v === "string" && META_ID.test(v) ? v : null);
const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;
const cents = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const sameName = (a: unknown, b: string) => String(a ?? "").trim() === b.trim();

async function graphPost(token: string, path: string, params: Record<string, string>): Promise<Row> {
  const body = new URLSearchParams(params);
  body.set("access_token", token);
  const res = await fetch(GRAPH + path, { method: "POST", body });
  const raw = await res.text();
  let json: Row = {};
  try {
    json = JSON.parse(raw) as Row;
  } catch {
    /* non-JSON error page */
  }
  const err = json.error as { message?: string; error_user_msg?: string } | undefined;
  if (!res.ok || err) throw new Error(err?.error_user_msg || err?.message || `Meta ${res.status}: ${raw.slice(0, 200)}`);
  return json;
}

// Where an object sits, as the card names it: an ad's ad set and campaign,
// an ad set's campaign. Two ads can share a name; the path tells them apart,
// and a card whose path no longer matches is out of date.
interface Parents {
  adsetName?: string;
  campaignName?: string;
}

const PARENT_FIELDS: Record<Level, string[]> = { campaign: [], adset: ["campaign{name}"], ad: ["adset{name}", "campaign{name}"] };

/** The parent names a level must carry, read from the agent's args. */
function parseParents(level: Level, a: Row): Parsed<Parents> {
  const out: Parents = {};
  if (level === "ad") {
    const adsetName = text(a.adsetName, 400);
    if (!adsetName) return { ok: false, error: "an ad names its ad set (adsetName)" };
    out.adsetName = adsetName;
  }
  if (level !== "campaign") {
    const campaignName = text(a.campaignName, 400);
    if (!campaignName) return { ok: false, error: `an ${level === "ad" ? "ad" : "ad set"} names its campaign (campaignName)` };
    out.campaignName = campaignName;
  }
  return { ok: true, args: out };
}

/** Read one object back and refuse unless it is this client's, under the card's name and path. */
async function liveObject(
  ctx: Ctx,
  level: Level,
  objectId: string,
  name: string,
  extra: string[] = [],
  parents: Parents = {},
): Promise<Row> {
  const fields = ["account_id", "name", "status", LEVEL_FIELD[level], ...PARENT_FIELDS[level], ...extra].join(",");
  let o: Row;
  try {
    o = await graphGet(ctx.token, `/${objectId}`, { fields });
  } catch (err) {
    throw new MetaOpRefused(409, `Meta could not read ${LEVEL_WORD[level]} ${objectId}: ${(err as Error).message}`);
  }
  if (String(o.account_id ?? "") !== ctx.accountNum) {
    throw new MetaOpRefused(403, `${LEVEL_WORD[level]} ${objectId} is not in this client's ad account`);
  }
  if (!sameName(o.name, name)) {
    throw new MetaOpRefused(409, `${LEVEL_WORD[level]} ${objectId} is called "${String(o.name ?? "")}" now, not "${name}"; the card is out of date`);
  }
  const parentName = (key: "adset" | "campaign") => String(((o[key] ?? {}) as Row).name ?? "");
  if (parents.adsetName !== undefined && !sameName(parentName("adset"), parents.adsetName)) {
    throw new MetaOpRefused(409, `${LEVEL_WORD[level]} "${name}" is in ad set "${parentName("adset")}", not "${parents.adsetName}"; the card is out of date`);
  }
  if (parents.campaignName !== undefined && !sameName(parentName("campaign"), parents.campaignName)) {
    throw new MetaOpRefused(409, `${LEVEL_WORD[level]} "${name}" is in campaign "${parentName("campaign")}", not "${parents.campaignName}"; the card is out of date`);
  }
  return o;
}

interface StatusArgs extends Parents {
  level: Level;
  id: string;
  name: string;
}

function parseStatus(a: Row): Parsed<StatusArgs> {
  const level = a.level as Level;
  const objectId = id(a.id);
  const name = text(a.name, 400);
  if (!LEVELS.includes(level)) return { ok: false, error: "level is campaign, adset or ad" };
  if (!objectId || !name) return { ok: false, error: "id (digits) and name (as Ads Manager shows it) required" };
  const parents = parseParents(level, a);
  if (!parents.ok) return parents;
  return { ok: true, args: { level, id: objectId, name, ...parents.args } };
}

const statusOp = (to: "PAUSED" | "ACTIVE"): Op<StatusArgs> => ({
  write: true,
  parse: parseStatus,
  check: (ctx, a) => liveObject(ctx, a.level, a.id, a.name, [], a),
  send: async (ctx, a, checked) => {
    await graphPost(ctx.token, `/${a.id}`, { status: to });
    return {
      action: to === "PAUSED" ? "paused" : "resumed",
      level: a.level,
      id: a.id,
      name: a.name,
      before: String((checked as Row).status ?? ""),
      after: to,
    };
  },
});

interface BudgetArgs extends Parents {
  level: "campaign" | "adset";
  id: string;
  name: string;
  from: number;
  to: number;
}

/** The guard, as words when it refuses. */
export function budgetGuard(from: number, to: number): string | null {
  if (to > BUDGET_MAX_CENTS) return `a daily budget over ${money(BUDGET_MAX_CENTS)} needs Jake in Ads Manager`;
  if (to > from * BUDGET_MAX_FACTOR) return `more than ${BUDGET_MAX_FACTOR}x the current budget in one change; split it over cards`;
  return null;
}

// A new ad's picture or film. An image is a Creatives file, uploaded to the
// account in one call. A video must already be in the client's Meta ad
// account library (sent there from Creatives): a film never passes through
// the Worker.
type AdSource = { kind: "file"; fileId: string; fileName: string } | { kind: "video"; videoId: string; videoName: string };

interface CreateAdArgs {
  adsetId: string;
  adsetName: string;
  campaignName: string;
  fileId?: string;
  fileName?: string;
  videoId?: string;
  videoName?: string;
  name: string;
  message: string;
  headline: string | null;
  status: "PAUSED" | "ACTIVE";
}

const sourceOf = (a: CreateAdArgs): AdSource =>
  a.videoId ? { kind: "video", videoId: a.videoId, videoName: a.videoName! } : { kind: "file", fileId: a.fileId!, fileName: a.fileName! };

interface Destination {
  ctaType: string;
  link: string | null;
  leadFormId: string | null;
  pageId: string;
  instagramUserId: string | null;
}

// Where the ad set's ads already send people: the call to action, the link,
// the lead form, the Page. A new ad copies it, so it goes where the others
// go. Ads that disagree, or that run from a post or a dynamic creative, give
// nothing to copy: Jake builds that one himself.
function destinationOf(spec: Row | undefined): Destination | null {
  if (!spec || typeof spec !== "object") return null;
  const data = (spec.link_data ?? spec.video_data) as Row | undefined;
  if (!data || typeof data !== "object") return null;
  const cta = (data.call_to_action ?? {}) as Row;
  const value = (cta.value ?? {}) as Row;
  const ctaType = typeof cta.type === "string" ? cta.type : null;
  const link = typeof data.link === "string" ? data.link : typeof value.link === "string" ? value.link : null;
  const leadFormId = typeof value.lead_gen_form_id === "string" ? value.lead_gen_form_id : null;
  const pageId = typeof spec.page_id === "string" ? spec.page_id : null;
  if (!ctaType || !pageId || (!link && !leadFormId)) return null;
  const ig = spec.instagram_user_id ?? spec.instagram_actor_id;
  return { ctaType, link, leadFormId, pageId, instagramUserId: typeof ig === "string" ? ig : null };
}

type Media = { kind: "image"; path: string; name: string } | { kind: "video"; videoId: string; name: string };

interface CreateChecked {
  media: Media;
  dest: Destination;
}

const NOT_IN_LIBRARY =
  "that video is not ready in the client's Meta ad account library; send it to Meta from Creatives first, then read.library and card it again";

// One page of the account's videos, newest first. Bounded on purpose: the
// video for a new ad is one Jake just sent from Creatives.
async function libraryVideos(ctx: Ctx): Promise<{ id: string; name: string; ready: boolean }[]> {
  const r = await graphGet(ctx.token, `/${ctx.account}/advideos`, { fields: "id,title,status", limit: "200" });
  return ((r.data as Row[]) ?? [])
    .filter((v) => typeof v.id === "string")
    .map((v) => ({ id: String(v.id), name: String(v.title ?? ""), ready: ((v.status ?? {}) as Row).video_status === "ready" }));
}

async function thumbnailOf(ctx: Ctx, videoId: string): Promise<string> {
  const t = await graphGet(ctx.token, `/${videoId}/thumbnails`, { fields: "uri,is_preferred" });
  const thumbs = ((t.data as Row[]) ?? []).filter((x) => typeof x.uri === "string");
  const pick = thumbs.find((x) => x.is_preferred === true) ?? thumbs[0];
  if (!pick) throw new Error("Meta gave the video no thumbnail");
  return String(pick.uri);
}

async function mediaFor(ctx: Ctx, src: AdSource): Promise<Media> {
  if (src.kind === "video") {
    const v = (await libraryVideos(ctx)).find((x) => x.id === src.videoId);
    if (!v || !v.ready) throw new MetaOpRefused(409, NOT_IN_LIBRARY);
    if (!sameName(v.name, src.videoName)) throw new MetaOpRefused(409, `that library video is called "${v.name}", not "${src.videoName}"`);
    return { kind: "video", videoId: v.id, name: v.name };
  }
  // The Creatives file: this client's own, under the card's name, an image.
  const { data: fRow, error } = await ctx.client
    .from("ad_creative_files")
    .select("id, tenant_id, path, name, kind")
    .eq("id", src.fileId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (error) throw new Error(`creative: ${error.message}`);
  const f = fRow as Row | null;
  if (!f) throw new MetaOpRefused(403, "that Creatives file is not this client's");
  if (!sameName(f.name, src.fileName)) throw new MetaOpRefused(409, `that Creatives file is called "${String(f.name)}", not "${src.fileName}"`);
  if (f.kind !== "image") throw new MetaOpRefused(409, NOT_IN_LIBRARY);
  return { kind: "image", path: String(f.path), name: String(f.name) };
}

const createAd: Op<CreateAdArgs> = {
  write: true,
  parse: (a) => {
    const adsetId = id(a.adsetId);
    const adsetName = text(a.adsetName, 400);
    const campaignName = text(a.campaignName, 400);
    const name = text(a.name, 400);
    const message = text(a.message, 5000);
    if (!adsetId || !adsetName || !campaignName) return { ok: false, error: "adsetId, adsetName and campaignName required" };
    const hasFile = a.fileId !== undefined || a.fileName !== undefined;
    const hasVideo = a.videoId !== undefined || a.videoName !== undefined;
    if (hasFile === hasVideo) {
      return { ok: false, error: "give either fileId and fileName (an image from read.creatives) or videoId and videoName (from read.library)" };
    }
    let source: Pick<CreateAdArgs, "fileId" | "fileName" | "videoId" | "videoName">;
    if (hasFile) {
      const fileId = isUuid(a.fileId) ? a.fileId : null;
      const fileName = text(a.fileName, 200);
      if (!fileId || !fileName) return { ok: false, error: "fileId and fileName (from read.creatives) required" };
      source = { fileId, fileName };
    } else {
      const videoId = id(a.videoId);
      const videoName = text(a.videoName, 400);
      if (!videoId || !videoName) return { ok: false, error: "videoId and videoName (from read.library) required" };
      source = { videoId, videoName };
    }
    if (!name || !message) return { ok: false, error: "name and message (primary text) required" };
    let headline: string | null = null;
    if (a.headline !== undefined && a.headline !== null) {
      headline = text(a.headline, 255);
      if (!headline) return { ok: false, error: "headline is text up to 255 characters" };
    }
    const status = a.status ?? "PAUSED";
    if (status !== "PAUSED" && status !== "ACTIVE") return { ok: false, error: "status is PAUSED or ACTIVE" };
    return { ok: true, args: { adsetId, adsetName, campaignName, ...source, name, message, headline, status } };
  },
  check: async (ctx, a): Promise<CreateChecked> => {
    // A new ad runs from the client's own Page, so that Page must be on file:
    // without it there is nothing to hold the ad set's Page against.
    if (!ctx.pageId) throw new MetaOpRefused(409, "this client has no Facebook Page on file; set the client's Page first");
    const media = await mediaFor(ctx, sourceOf(a));

    await liveObject(ctx, "adset", a.adsetId, a.adsetName, [], { campaignName: a.campaignName });

    const ads = await graphGetAll(ctx.token, `/${a.adsetId}/ads`, { fields: "id,name,creative{object_story_spec}", limit: "100" }, 5, { strict: true });
    if (ads.some((x) => sameName(x.name, a.name))) throw new MetaOpRefused(409, `ad set "${a.adsetName}" already has an ad called "${a.name}"`);
    const dests = ads.map((x) => destinationOf(((x.creative ?? {}) as Row).object_story_spec as Row | undefined));
    const usable = dests.filter((d): d is Destination => !!d);
    if (!usable.length || usable.length !== dests.length) {
      throw new MetaOpRefused(409, "the ads in that ad set have no plain link or lead form to copy; Jake builds this one in Ads Manager");
    }
    const key = (d: Destination) => JSON.stringify([d.ctaType, d.link, d.leadFormId, d.pageId, d.instagramUserId]);
    if (new Set(usable.map(key)).size > 1) {
      throw new MetaOpRefused(409, "the ads in that ad set go to different places; say which on a new card or Jake builds it");
    }
    const dest = usable[0];
    if (dest.pageId !== ctx.pageId) {
      throw new MetaOpRefused(409, "the ads in that ad set run from a Page that is not this client's");
    }
    return { media, dest };
  },
  send: async (ctx, a, checked) => {
    const { media, dest } = checked as CreateChecked;
    const value: Row = {};
    if (dest.leadFormId) value.lead_gen_form_id = dest.leadFormId;
    const spec: Row = { page_id: dest.pageId };
    if (dest.instagramUserId) spec.instagram_user_id = dest.instagramUserId;
    if (media.kind === "image") {
      const blob = await ctx.deps.download(media.path);
      const { hash } = await uploadAdImage(ctx.token, ctx.account, blob, media.name);
      spec.link_data = {
        image_hash: hash,
        ...(dest.link ? { link: dest.link } : {}),
        message: a.message,
        ...(a.headline ? { name: a.headline } : {}),
        call_to_action: { type: dest.ctaType, value: dest.leadFormId ? value : { link: dest.link } },
      };
    } else {
      const imageUrl = await thumbnailOf(ctx, media.videoId);
      if (dest.link) value.link = dest.link;
      spec.video_data = {
        video_id: media.videoId,
        image_url: imageUrl,
        message: a.message,
        ...(a.headline ? { title: a.headline } : {}),
        call_to_action: { type: dest.ctaType, value },
      };
    }
    const creative = await graphPost(ctx.token, `/${ctx.account}/adcreatives`, {
      name: `${a.name} (agent)`,
      object_story_spec: JSON.stringify(spec),
    });
    const creativeId = String(creative.id ?? "");
    if (!creativeId) throw new Error("Meta made the creative but returned no id");
    const ad = await graphPost(ctx.token, `/${ctx.account}/ads`, {
      name: a.name,
      adset_id: a.adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: a.status,
    });
    return { action: "created", adId: String(ad.id ?? ""), creativeId, name: a.name, adset: a.adsetName, media: media.name, status: a.status };
  },
};

const ops = {
  "read.structure": {
    write: false,
    parse: () => ({ ok: true, args: {} }),
    check: async (ctx) => {
      const get = (edge: string, fields: string) =>
        graphGetAll(ctx.token, `/${ctx.account}/${edge}`, { fields, limit: "200" }, 5, { strict: true });
      const [campaigns, adsets, ads] = await Promise.all([
        get("campaigns", "id,name,status,effective_status,objective,daily_budget,lifetime_budget"),
        get("adsets", "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget"),
        get("ads", "id,name,status,effective_status,adset_id,campaign_id"),
      ]);
      return { account: ctx.account, budgetsIn: "cents", campaigns, adsets, ads };
    },
  } satisfies Op<Record<string, never>>,

  "read.creatives": {
    write: false,
    parse: () => ({ ok: true, args: {} }),
    check: async (ctx) => {
      const { data, error } = await ctx.client
        .from("ad_creative_files")
        .select("id, name, kind, size_bytes, width, height, created_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`creatives: ${error.message}`);
      return ((data ?? []) as Row[]).map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        size: Number(r.size_bytes ?? 0),
        width: r.width ?? null,
        height: r.height ?? null,
        createdAt: r.created_at ?? null,
      }));
    },
  } satisfies Op<Record<string, never>>,

  "read.library": {
    write: false,
    parse: () => ({ ok: true, args: {} }),
    check: (ctx) => libraryVideos(ctx),
  } satisfies Op<Record<string, never>>,

  pause: statusOp("PAUSED"),
  resume: statusOp("ACTIVE"),

  dailyBudget: {
    write: true,
    parse: (a) => {
      const level = a.level as BudgetArgs["level"];
      const objectId = id(a.id);
      const name = text(a.name, 400);
      const from = cents(a.from);
      const to = cents(a.to);
      if (level !== "campaign" && level !== "adset") return { ok: false, error: "level is campaign or adset" };
      if (!objectId || !name) return { ok: false, error: "id and name required" };
      const parents = parseParents(level, a);
      if (!parents.ok) return parents;
      if (from === null || to === null) return { ok: false, error: "from and to are whole cents per day" };
      if (from === to) return { ok: false, error: "to is the same as from" };
      const guard = budgetGuard(from, to);
      if (guard) return { ok: false, error: guard };
      return { ok: true, args: { level, id: objectId, name, ...parents.args, from, to } };
    },
    check: async (ctx, a) => {
      const o = await liveObject(ctx, a.level, a.id, a.name, ["daily_budget", "lifetime_budget"], a);
      const live = Number(o.daily_budget ?? 0);
      if (!(live > 0)) {
        throw new MetaOpRefused(409, `${LEVEL_WORD[a.level]} "${a.name}" has no daily budget of its own (lifetime, or set at the ${a.level === "adset" ? "campaign" : "ad set"} level)`);
      }
      if (live !== a.from) {
        throw new MetaOpRefused(409, `the live daily budget is ${money(live)}, not ${money(a.from)}; the card is out of date`);
      }
      return o;
    },
    send: async (ctx, a) => {
      await graphPost(ctx.token, `/${a.id}`, { daily_budget: String(a.to) });
      return { action: "budget", level: a.level, id: a.id, name: a.name, from: a.from, to: a.to, words: `${money(a.from)} to ${money(a.to)} per day` };
    },
  } satisfies Op<BudgetArgs>,

  createAd,
};

/** The allowlist. Nothing outside it reaches Meta from an agent. */
export const META_OPS: Readonly<Record<MetaOpName, Op<never>>> = ops as unknown as Record<MetaOpName, Op<never>>;

export function isMetaOp(op: unknown): op is MetaOpName {
  return typeof op === "string" && Object.prototype.hasOwnProperty.call(META_OPS, op);
}

export function isMetaWriteOp(op: string): boolean {
  return isMetaOp(op) && META_OPS[op].write;
}

export function parseMetaOpArgs(op: string, args: unknown): Parsed<Row> {
  if (!isMetaOp(op)) return { ok: false, error: "unknown op" };
  const a = args && typeof args === "object" && !Array.isArray(args) ? (args as Row) : {};
  return (META_OPS[op] as unknown as Op<Row>).parse(a);
}

/** Is this exact change on the approved card? Both sides through the op's parser. */
export function metaOpOnCard(cardOps: unknown, op: MetaOpName, args: Row): boolean {
  if (!Array.isArray(cardOps)) return false;
  const want = JSON.stringify(args);
  return cardOps.some((o) => {
    if (!o || typeof o !== "object" || (o as Row).op !== op) return false;
    const p = parseMetaOpArgs(op, (o as Row).args);
    return p.ok && JSON.stringify(p.args) === want;
  });
}

export interface MetaCallerChat {
  agent: AgentId;
  tenantId: string | null;
  auto: boolean;
}

export interface MetaGrantItem {
  id: string;
  agent: AgentId;
  tenantId: string | null;
  approvedAt: string | null;
  ops?: unknown;
}

/**
 * May this turn change the client's Ads Manager? Pure; the endpoint reads the
 * rows. Only the follow-up to an Ads Agent card at this client that Jake
 * approved, carrying that card's meta grant. Never a typed ask.
 */
export function metaWriteAllowed(message: AgentMessage, chat: MetaCallerChat, item: MetaGrantItem | null = null): boolean {
  if (message.role !== "me" || message.status !== "running" || chat.agent !== "ads") return false;
  const g = message.grant;
  if (!g || g.kind !== "meta" || message.followUpOf !== g.itemId) return false;
  return !!item && item.id === g.itemId && item.agent === "ads" && item.tenantId === chat.tenantId && !!item.approvedAt;
}

export interface MetaCallBody {
  messageId?: unknown;
  tenantId?: unknown;
  op?: unknown;
  args?: unknown;
}

export type MetaCallResult = { status: number; body: Row };
const out = (status: number, body: Row): MetaCallResult => ({ status, body });

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function auditAdmin(client: SupabaseClient, chatUser: string | null): Promise<string | null> {
  if (chatUser) return chatUser;
  const { data, error } = await client
    .from("admin_accounts")
    .select("id")
    .eq("role", "owner")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  fail("owner", error);
  return (((data ?? [])[0] as Row | undefined)?.id as string | undefined) ?? null;
}

async function canManageAds(token: string): Promise<boolean> {
  try {
    const p = await graphGet(token, "/me/permissions", {});
    return ((p.data as Row[]) ?? []).some((r) => r.permission === "ads_management" && r.status === "granted");
  } catch {
    return false;
  }
}

/**
 * POST /api/agent-runner/meta-ops, minus the HTTP. Every check happens here,
 * in order: the op and its args, the turn, the grant and the card, the
 * client's account, the token, the live object, the audit row, then Meta.
 */
export async function callMetaOp(client: SupabaseClient, body: MetaCallBody, deps: MetaCallDeps): Promise<MetaCallResult> {
  const op = body.op;
  if (!isMetaOp(op)) return out(400, { error: "unknown op" });
  const parsed = parseMetaOpArgs(op, body.args);
  if (!parsed.ok) return out(400, { error: parsed.error });
  if (!isUuid(body.messageId) || !isUuid(body.tenantId)) return out(400, { error: "messageId and tenantId required" });
  const tenantId = body.tenantId;

  const { data: mRow, error: mErr } = await client.from("agent_messages").select("*").eq("id", body.messageId).maybeSingle();
  fail("message", mErr);
  if (!mRow) return out(403, { error: "not an Ads Agent turn" });
  const message = messageFromRow(mRow as Row);

  const { data: cRow, error: cErr } = await client
    .from("agent_chats")
    .select("id, tenant_id, agent, auto, user_id")
    .eq("id", message.chatId)
    .maybeSingle();
  fail("chat", cErr);
  const c = cRow as Row | null;
  const chat: MetaCallerChat | null = c
    ? { agent: c.agent as AgentId, tenantId: (c.tenant_id as string | null) ?? null, auto: c.auto === true }
    : null;
  if (!chat || chat.agent !== "ads" || chat.tenantId !== tenantId || message.role !== "me" || message.status !== "running") {
    return out(403, { error: "not an Ads Agent turn for this client" });
  }

  const write = META_OPS[op].write;
  let item: MetaGrantItem | null = null;
  if (write) {
    if (message.grant) {
      const { data: iRow, error: iErr } = await client
        .from("agent_items")
        .select("id, tenant_id, agent, approved_at, payload")
        .eq("id", message.grant.itemId)
        .maybeSingle();
      fail("item", iErr);
      const i = iRow as Row | null;
      item = i
        ? {
            id: i.id as string,
            agent: i.agent as AgentId,
            tenantId: (i.tenant_id as string | null) ?? null,
            approvedAt: (i.approved_at as string | null) ?? null,
            ops: ((i.payload as Row | null) ?? {}).ops,
          }
        : null;
    }
    if (!metaWriteAllowed(message, chat, item)) {
      return out(403, { error: "Ads Manager changes need Jake's Approve on a card; post one" });
    }
    if (!metaOpOnCard(item?.ops, op, parsed.args)) {
      return out(403, { error: "that change is not on the card Jake approved" });
    }
  }

  const { data: tRow, error: tErr } = await client
    .from("tenants")
    .select("meta_ad_account_id, meta_page_id")
    .eq("id", tenantId)
    .maybeSingle();
  fail("tenant", tErr);
  const t = (tRow as Row | null) ?? {};
  const raw = String(t.meta_ad_account_id ?? "").trim();
  if (!raw) return out(409, { error: "no Meta ad account on this client" });
  const account = normalizeAccount(raw);
  const pageId = String(t.meta_page_id ?? "").trim() || null;

  const token = await deps.token();
  if (!token) return out(503, { error: "Meta not connected" });
  if (write && !(await canManageAds(token))) {
    return out(503, { error: "the Meta System User token does not hold ads_management; Jake grants it in Business Settings" });
  }

  const ctx: Ctx = { client, tenantId, token, account, accountNum: account.slice(4), pageId, deps };
  const impl = META_OPS[op] as unknown as Op<Row>;

  let checked: unknown;
  try {
    checked = await impl.check(ctx, parsed.args);
  } catch (err) {
    if (err instanceof MetaOpRefused) return out(err.status, { error: err.message });
    return out(502, { error: `Meta said no: ${(err as Error).message}` });
  }
  if (!write) return out(200, { op, result: checked });

  const audit = { messageId: message.id, chatId: message.chatId, itemId: item?.id ?? null, op, args: parsed.args, account };
  const adminId = await auditAdmin(client, (c?.user_id as string | null) ?? null);
  const logged = adminId ? await logAdminAction(client, adminId, `agent:meta.${op}`, tenantId, audit) : false;
  if (!logged) return out(500, { error: "could not record the change, so it was not made" });

  try {
    const result = await impl.send!(ctx, parsed.args, checked);
    return out(200, { op, result });
  } catch (err) {
    await logAdminAction(client, adminId!, "agent:meta.failed", tenantId, { ...audit, error: (err as Error).message });
    if (err instanceof MetaOpRefused) return out(err.status, { error: err.message });
    return out(502, { error: `Meta said no: ${(err as Error).message}` });
  }
}
