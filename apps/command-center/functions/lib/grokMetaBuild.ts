import type { SupabaseClient } from "@supabase/supabase-js";
import { graphGet, graphGetAll } from "./metaGraph";
import { graphPost, libraryVideos, thumbnailOf } from "./agentMetaOps";
import { normalizeAccount, uploadAdImage } from "./metaUpload";
import { listReachablePages } from "./metaPages";
import { readPages } from "./briefPagesStore";
import type { AdsPage } from "../../src/lib/briefPages";

// What the Grok Ads bot can build in a client's Meta account
// (docs/build-plans/grok-build-tools.md). Jake's Mission Control spec for a
// lead campaign, in code, so a bot cannot drift from it:
//
//   - Everything is created PAUSED. There is no status argument anywhere, and
//     no tool here edits, pauses, resumes, re-budgets or deletes. Jake's
//     Publish in Ads Manager is the approval.
//   - Every parent is read back first: the campaign and ad set must sit in
//     THIS client's ad account, the lead form on THIS client's Page, the
//     picture or film must be this client's.
//   - No lead forms. Meta's API cannot set an answer that closes the form or
//     the non-lead end page, and a published form cannot be edited, so Jake
//     builds the form from the bot's steps (his call, 2026-10-26).
//   - A campaign's daily budget is at most the Ads plan's daily spend, or
//     $100 a day when the plan has none, and never over $500.

type Row = Record<string, unknown>;

export class BuildRefused extends Error {}

const META_ID = /^\d{1,30}$/;

export const NO_PLAN_CAP_USD = 100;
export const HARD_CAP_USD = 500;
export const MAX_ZIPS = 20;

// ---------- Pure parts (tested) ----------

/** The highest daily spend on the Ads plan, in dollars, or null. */
export function planDailySpend(page: AdsPage | null): number | null {
  const spends = (page?.campaigns ?? []).map((c) => c.dailySpend).filter((n): n is number => typeof n === "number" && n > 0);
  return spends.length ? Math.max(...spends) : null;
}

/** Why a daily budget is refused, or null. */
export function budgetProblem(usd: number, plan: number | null): string | null {
  if (!Number.isFinite(usd) || usd < 5) return "daily_budget_usd is at least 5";
  if (usd > HARD_CAP_USD) return `over $${HARD_CAP_USD}/day; Jake sets that himself`;
  if (plan !== null && usd > plan) return `over the Ads plan's $${plan}/day; Jake changes the plan or sets it himself`;
  if (plan === null && usd > NO_PLAN_CAP_USD) return `the Ads plan has no daily spend, so the cap is $${NO_PLAN_CAP_USD}/day`;
  return null;
}

/** 5-digit US zips, unique, 1 to 20, as Meta's geo keys. */
export function zipKeys(zips: unknown): { key: string }[] {
  if (!Array.isArray(zips)) throw new BuildRefused("zips is a list of 5-digit zip codes");
  const clean = [...new Set(zips.map((z) => String(z).trim()))];
  if (!clean.length || clean.some((z) => !/^\d{5}$/.test(z))) throw new BuildRefused("zips are 5-digit US zip codes");
  if (clean.length > MAX_ZIPS) throw new BuildRefused(`at most ${MAX_ZIPS} zip codes`);
  return clean.map((z) => ({ key: `US:${z}` }));
}

/** The next midnight in the ad account's zone, as Meta takes it: 2026-10-27T00:00:00-0400. */
export function nextMidnight(nowMs: number, offsetHours: number): string {
  const local = new Date(nowMs + offsetHours * 3_600_000);
  const next = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1));
  const sign = offsetHours < 0 ? "-" : "+";
  const abs = Math.abs(offsetHours);
  const hh = String(Math.floor(abs)).padStart(2, "0");
  const mm = String(Math.round((abs % 1) * 60)).padStart(2, "0");
  return `${next.toISOString().slice(0, 10)}T00:00:00${sign}${hh}${mm}`;
}

/** Jake's targeting: the zips, 18 to 65+, Facebook and Instagram feeds, stories and reels only. */
export function targetingSpec(zips: { key: string }[]): Row {
  return {
    geo_locations: { zips, location_types: ["home", "recent"] },
    age_min: 18,
    age_max: 65,
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed", "story", "facebook_reels"],
    instagram_positions: ["stream", "story", "reels"],
    device_platforms: ["mobile", "desktop"],
    // Off, so the zips and ages are rules, not suggestions. Meta requires the
    // flag on new ad sets from v23.
    targeting_automation: { advantage_audience: 0 },
  };
}

// Advantage+ creative enhancements off, one feature at a time (the bundle
// opt-out went in v22). Meta drops any that do not apply to the format.
export const ENHANCEMENTS_OFF = Object.fromEntries(
  ["image_templates", "image_touchups", "text_optimizations", "inline_comment", "video_auto_crop"].map((k) => [k, { enroll_status: "OPT_OUT" }]),
);

export const AD_CTAS = ["GET_QUOTE", "SIGN_UP", "LEARN_MORE", "APPLY_NOW", "CONTACT_US", "BOOK_NOW"] as const;
export const DEV_MODE =
  "Meta makes ads only through a Live app, and the agency's Meta app (Hauck Marketing Lab) is in Development mode. Jake switches it to Live at developers.facebook.com, then ask again.";
export const DEFAULT_UTM = "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}";

export type AdMedia = { kind: "image"; hash: string } | { kind: "video"; videoId: string; thumb: string };

export interface AdCopy {
  formId: string;
  message: string;
  headline: string;
  description: string | null;
  cta: (typeof AD_CTAS)[number];
}

/** A lead form ad's object_story_spec. Lead ads take Meta's placeholder link. */
export function adStorySpec(pageId: string, igUserId: string | null, media: AdMedia, c: AdCopy): Row {
  const cta = { type: c.cta, value: { lead_gen_form_id: c.formId } };
  const spec: Row = { page_id: pageId };
  if (igUserId) spec.instagram_user_id = igUserId;
  if (media.kind === "image") {
    spec.link_data = {
      image_hash: media.hash,
      link: "http://fb.me/",
      message: c.message,
      name: c.headline,
      ...(c.description ? { description: c.description } : {}),
      call_to_action: cta,
    };
  } else {
    spec.video_data = {
      video_id: media.videoId,
      image_url: media.thumb,
      message: c.message,
      title: c.headline,
      ...(c.description ? { link_description: c.description } : {}),
      call_to_action: cta,
    };
  }
  return spec;
}

// ---------- Live parts ----------

export interface BuildCtx {
  client: SupabaseClient;
  tenantId: string;
  token: string;
  account: string; // act_123
  pageId: string | null;
  download(path: string): Promise<Blob>;
}

export async function buildCtx(
  client: SupabaseClient,
  tenantId: string,
  token: string,
  download: (path: string) => Promise<Blob>,
): Promise<BuildCtx> {
  const { data, error } = await client.from("tenants").select("meta_ad_account_id, meta_page_id").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`client: ${error.message}`);
  const t = (data as Row | null) ?? {};
  const raw = String(t.meta_ad_account_id ?? "").trim();
  if (!raw) throw new BuildRefused("this client has no Meta ad account connected");
  return { client, tenantId, token, account: normalizeAccount(raw), pageId: String(t.meta_page_id ?? "").trim() || null, download };
}

const metaId = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !META_ID.test(v)) throw new BuildRefused(`${what} is a Meta id (digits)`);
  return v;
};

const validateOnly = (checkOnly: boolean): Record<string, string> => (checkOnly ? { execution_options: JSON.stringify(["validate_only"]) } : {});

async function pageToken(ctx: BuildCtx): Promise<{ pageId: string; token: string }> {
  if (!ctx.pageId) throw new BuildRefused("this client has no Facebook Page on file; set it on the client first");
  const page = (await listReachablePages(ctx.token)).find((p) => p.id === ctx.pageId);
  if (!page) throw new BuildRefused("the agency's Meta system user cannot reach this client's Page; Jake gives it access in Business Settings");
  return { pageId: page.id, token: page.accessToken };
}

/** The Page's lead forms: id, name, status. */
export async function pageForms(ctx: BuildCtx): Promise<{ id: string; name: string; status: string }[]> {
  const p = await pageToken(ctx);
  const rows = await graphGetAll(p.token, `/${p.pageId}/leadgen_forms`, { fields: "id,name,status", limit: "100" }, 5);
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? ""), status: String(r.status ?? "") }));
}

/** Read one object and refuse unless it is in this client's account. */
async function ownObject(ctx: BuildCtx, id: string, fields: string, what: string): Promise<Row> {
  let o: Row;
  try {
    o = await graphGet(ctx.token, `/${id}`, { fields: `account_id,name,${fields}` });
  } catch (err) {
    throw new BuildRefused(`Meta could not read ${what} ${id}: ${(err as Error).message}`);
  }
  if (`act_${String(o.account_id ?? "")}` !== ctx.account) throw new BuildRefused(`${what} ${id} is not in this client's ad account`);
  return o;
}

async function account(ctx: BuildCtx): Promise<{ currency: string; offset: number }> {
  const a = await graphGet(ctx.token, `/${ctx.account}`, { fields: "currency,timezone_offset_hours_utc" });
  return { currency: String(a.currency ?? ""), offset: Number(a.timezone_offset_hours_utc ?? 0) };
}

async function namesIn(ctx: BuildCtx, path: string): Promise<Set<string>> {
  const rows = await graphGetAll(ctx.token, path, { fields: "name", limit: "200" }, 5, { strict: true });
  return new Set(rows.map((r) => String(r.name ?? "").trim()));
}

const text = (v: unknown, what: string, max: number): string => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max) throw new BuildRefused(`${what} is text up to ${max} characters`);
  return v.trim();
};

export async function createCampaign(ctx: BuildCtx, a: Row, checkOnly: boolean): Promise<Row> {
  const name = text(a.name, "name", 200);
  const usd = Number(a.daily_budget_usd);
  const pages = await readPages(ctx.client, ctx.tenantId);
  const adsPage = pages.find((p) => p.page === "ads");
  const plan = planDailySpend(adsPage && adsPage.version > 0 ? (adsPage.data as AdsPage) : null);
  const problem = budgetProblem(usd, plan);
  if (problem) throw new BuildRefused(problem);
  const acct = await account(ctx);
  if (acct.currency !== "USD") throw new BuildRefused(`this ad account is in ${acct.currency}; Jake builds this one`);
  if ((await namesIn(ctx, `/${ctx.account}/campaigns`)).has(name)) throw new BuildRefused(`a campaign called "${name}" already exists`);
  const made = await graphPost(ctx.token, `/${ctx.account}/campaigns`, {
    name,
    objective: "OUTCOME_LEADS",
    buying_type: "AUCTION",
    special_ad_categories: "[]",
    daily_budget: String(Math.round(usd * 100)),
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    ...validateOnly(checkOnly),
  });
  if (checkOnly) return { checked: "campaign", ok: true, name, dailyBudgetUsd: usd };
  return { created: "campaign", id: String(made.id ?? ""), name, dailyBudgetUsd: usd, status: "PAUSED" };
}

export async function createAdset(ctx: BuildCtx, a: Row, checkOnly: boolean): Promise<Row> {
  const campaignId = metaId(a.campaign_id, "campaign_id");
  const name = text(a.name, "name", 200);
  const zips = zipKeys(a.zips);
  if (!ctx.pageId) throw new BuildRefused("this client has no Facebook Page on file; set it on the client first");
  const camp = await ownObject(ctx, campaignId, "objective", "campaign");
  if (camp.objective !== "OUTCOME_LEADS") throw new BuildRefused(`campaign "${String(camp.name)}" is not a Leads campaign`);
  if ((await namesIn(ctx, `/${campaignId}/adsets`)).has(name)) throw new BuildRefused(`that campaign already has an ad set called "${name}"`);
  const acct = await account(ctx);
  const start = nextMidnight(Date.now(), acct.offset);
  const made = await graphPost(ctx.token, `/${ctx.account}/adsets`, {
    name,
    campaign_id: campaignId,
    optimization_goal: "LEAD_GENERATION",
    billing_event: "IMPRESSIONS",
    destination_type: "ON_AD",
    promoted_object: JSON.stringify({ page_id: ctx.pageId }),
    targeting: JSON.stringify(targetingSpec(zips)),
    start_time: start,
    status: "PAUSED",
    ...validateOnly(checkOnly),
  });
  const out = { name, campaign: String(camp.name), zips: zips.length, starts: start };
  return checkOnly ? { checked: "ad set", ok: true, ...out } : { created: "ad set", id: String(made.id ?? ""), ...out, status: "PAUSED" };
}

async function instagramOf(ctx: BuildCtx): Promise<string | null> {
  try {
    const p = await graphGet(ctx.token, `/${ctx.pageId}`, { fields: "instagram_business_account" });
    const ig = (p.instagram_business_account ?? {}) as Row;
    return typeof ig.id === "string" ? ig.id : null;
  } catch {
    return null;
  }
}

export async function createAd(ctx: BuildCtx, a: Row, checkOnly: boolean): Promise<Row> {
  const adsetId = metaId(a.adset_id, "adset_id");
  const formId = metaId(a.lead_form_id, "lead_form_id");
  const name = text(a.name, "name", 200);
  const copy: AdCopy = {
    formId,
    message: text(a.primary_text, "primary_text", 5000),
    headline: text(a.headline, "headline", 255),
    description: a.description === undefined || a.description === null || a.description === "" ? null : text(a.description, "description", 255),
    cta: (a.cta ?? "GET_QUOTE") as AdCopy["cta"],
  };
  if (!AD_CTAS.includes(copy.cta)) throw new BuildRefused(`cta is one of ${AD_CTAS.join(", ")}`);
  const urlTags = a.url_tags === undefined || a.url_tags === "" ? DEFAULT_UTM : text(a.url_tags, "url_tags", 1000);
  const hasFile = typeof a.file_id === "string" && a.file_id !== "";
  const hasVideo = typeof a.video_id === "string" && a.video_id !== "";
  if (hasFile === hasVideo) throw new BuildRefused("give file_id (an image from get_ad_assets) or video_id (a ready library video), one of them");

  const adset = await ownObject(ctx, adsetId, "campaign{name}", "ad set");
  if (!(await pageForms(ctx)).some((f) => f.id === formId)) throw new BuildRefused(`lead form ${formId} is not on this client's Page`);
  if ((await namesIn(ctx, `/${adsetId}/ads`)).has(name)) throw new BuildRefused(`that ad set already has an ad called "${name}"`);

  // A check stops at our own reads: Meta validates a creative only with a
  // real uploaded image, and an upload is a write.
  let media: () => Promise<AdMedia>;
  let mediaName: string;
  if (hasVideo) {
    const v = (await libraryVideos(ctx)).find((x) => x.id === a.video_id);
    if (!v || !v.ready) throw new BuildRefused("that video is not ready in this client's Meta library; send it from Creatives first");
    media = async () => ({ kind: "video", videoId: v.id, thumb: await thumbnailOf(ctx, v.id) });
    mediaName = v.name;
  } else {
    const { data, error } = await ctx.client
      .from("ad_creative_files")
      .select("path, name, kind")
      .eq("id", String(a.file_id))
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (error) throw new Error(`creative: ${error.message}`);
    const f = data as Row | null;
    if (!f) throw new BuildRefused("that Creatives file is not this client's");
    if (f.kind !== "image") throw new BuildRefused("a Creatives video goes through the Meta library first (video_id)");
    mediaName = String(f.name);
    const path = String(f.path);
    media = async () => ({ kind: "image", hash: (await uploadAdImage(ctx.token, ctx.account, await ctx.download(path), mediaName)).hash });
  }
  if (checkOnly) return { checked: "ad", ok: true, name, adset: String(adset.name), media: mediaName, cta: copy.cta, urlTags };

  const spec = adStorySpec(ctx.pageId!, await instagramOf(ctx), await media(), copy);
  const creative = await graphPost(ctx.token, `/${ctx.account}/adcreatives`, {
    name: `${name} (grok)`,
    object_story_spec: JSON.stringify(spec),
    degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: ENHANCEMENTS_OFF }),
    url_tags: urlTags,
  }).catch((err: Error) => {
    // Seen live 2026-10-26: Meta takes ad creatives only from a Live app.
    if (/development mode/i.test(err.message)) throw new BuildRefused(DEV_MODE);
    throw err;
  });
  const creativeId = String(creative.id ?? "");
  if (!creativeId) throw new Error("Meta made the creative but returned no id");
  const ad = await graphPost(ctx.token, `/${ctx.account}/ads`, {
    name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: "PAUSED",
  });
  return { created: "ad", id: String(ad.id ?? ""), creativeId, name, adset: String(adset.name), media: mediaName, status: "PAUSED" };
}
