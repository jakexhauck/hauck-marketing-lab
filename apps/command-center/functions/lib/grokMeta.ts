import { AD_CREATIVES_BUCKET, listAdCreatives } from "./adCreativeFiles";
import { libraryVideos } from "./agentMetaOps";
import { graphGetAll } from "./metaGraph";
import { resolveMetaToken } from "./metaToken";
import { metaQuery } from "../api/agent-runner/meta";
import { BuildRefused, buildCtx, createAd, createAdset, createCampaign, pageForms, type BuildCtx } from "./grokMetaBuild";
import { META_REQUEST_TOOLS } from "./grokMetaRequest";
import { audited, botName, findClient, type ClientRef, type GrokDeps, type ToolDef } from "./grokMcp";

// The Meta connector: each client's ad account through the agency's System
// User token, which Grok cannot connect itself. Reads are results, structure
// and what an ad can be built from. Builds are create only, always PAUSED,
// budgets capped (lib/grokMetaBuild.ts). Every build is logged before it is
// sent. Everything else in Meta, short of budgets and on or off, is
// meta_request (lib/grokMetaRequest.ts).

type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

const json = (v: unknown) => JSON.stringify(v, null, 1);
const schema = (props: Record<string, unknown>, required: string[]) => ({ type: "object", properties: props, required });
const clientArg = { client: { type: "string", description: "Client name or slug, e.g. \"Willis\"." } };

async function metaAccount(d: GrokDeps, c: ClientRef): Promise<{ account: string; token: string }> {
  const { data } = await d.client.from("tenants").select("meta_ad_account_id").eq("id", c.id).maybeSingle();
  const raw = String((data as Row | null)?.meta_ad_account_id ?? "").trim();
  if (!raw) throw new Error(`${c.name} has no Meta ad account connected.`);
  const token = await resolveMetaToken(d.env);
  if (!token) throw new Error("Meta is not connected for the agency.");
  return { account: raw.startsWith("act_") ? raw : `act_${raw}`, token };
}

/** Plain refusals stay plain; anything else reads as Meta saying no. */
async function said<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof BuildRefused) throw new Error(err.message);
    throw new Error(`Meta said no: ${(err as Error).message}`);
  }
}

async function ctxFor(d: GrokDeps, c: ClientRef): Promise<BuildCtx> {
  const token = await resolveMetaToken(d.env);
  if (!token) throw new Error("Meta is not connected for the agency.");
  return said(
    buildCtx(d.client, c.id, token, async (path) => {
      const { data, error } = await d.client.storage.from(AD_CREATIVES_BUCKET).download(path);
      if (error || !data) throw new Error(`could not read the Creatives file: ${error?.message ?? "missing"}`);
      return data;
    }),
  );
}

// ---------- Reads ----------

const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

/** Meta reports the same lead under several action types; take the first present, never a sum. */
export function leadsFrom(actions: unknown): number {
  const list = Array.isArray(actions) ? (actions as Row[]) : [];
  for (const type of LEAD_ACTIONS) {
    const hit = list.find((x) => x.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const INSIGHT_FIELDS: Record<string, string> = {
  account: "spend,impressions,reach,frequency,clicks,ctr,cpm,actions",
  campaign: "campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpm,actions",
  ad: "ad_name,adset_name,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpm,actions",
};

const getAdResults: ToolDef<GrokDeps> = {
  name: "get_ad_results",
  description: "Meta results for a client: spend, impressions, reach, frequency, clicks, CTR, CPM, leads and cost per lead. level is account, campaign or ad (default ad); days 1 to 90 (default 7).",
  inputSchema: schema(
    { ...clientArg, days: { type: "number", description: "1 to 90, default 7" }, level: { type: "string", enum: ["account", "campaign", "ad"] } },
    ["client"],
  ),
  run: async (d, a) => {
    const c = await findClient(d.client, a.client);
    const q = metaQuery(typeof a.level === "string" ? a.level : "ad", a.days === undefined ? null : String(a.days));
    if (!q) throw new Error("level is account, campaign or ad; days 1 to 90.");
    const { account, token } = await metaAccount(d, c);
    const rows = await graphGetAll(
      token,
      `/${account}/insights`,
      { level: q.level, date_preset: q.preset, fields: INSIGHT_FIELDS[q.level], limit: "200", use_unified_attribution_setting: "true" },
      5,
      { strict: true },
    );
    const shaped = (rows as Row[]).map((r) => {
      const leads = leadsFrom(r.actions);
      const spend = Number(r.spend) || 0;
      const { actions: _actions, date_start: _ds, date_stop: _de, ...rest } = r;
      return { ...rest, leads, cpl: leads ? Math.round((spend / leads) * 100) / 100 : null };
    });
    return `# Meta results: ${c.name}, ${q.preset}, level ${q.level}\n${json(shaped)}`;
  },
};

const getAdStructure: ToolDef<GrokDeps> = {
  name: "get_ad_structure",
  description: "Every campaign, ad set and ad in the client's Meta account with status and budgets (budgets in cents: 4000 = $40.00/day).",
  inputSchema: schema(clientArg, ["client"]),
  run: async (d, a) => {
    const c = await findClient(d.client, a.client);
    const { account, token } = await metaAccount(d, c);
    const get = (edge: string, fields: string) => graphGetAll(token, `/${account}/${edge}`, { fields, limit: "200" }, 5, { strict: true });
    const [campaigns, adsets, ads] = await Promise.all([
      get("campaigns", "id,name,status,effective_status,objective,daily_budget,lifetime_budget"),
      get("adsets", "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget"),
      get("ads", "id,name,status,effective_status,adset_id,campaign_id"),
    ]);
    return `# Meta structure: ${c.name} (budgets in cents)\n${json({ campaigns, adsets, ads })}`;
  },
};

const getAdAssets: ToolDef<GrokDeps> = {
  name: "get_ad_assets",
  description: "What an ad can be built from: the client's Creatives files (file_id), the ready videos in their Meta library (video_id), and the lead forms on their Facebook Page (lead_form_id).",
  inputSchema: schema(clientArg, ["client"]),
  run: async (d, a) => {
    const c = await findClient(d.client, a.client);
    const token = await resolveMetaToken(d.env);
    if (!token) throw new Error("Meta is not connected for the agency.");
    const settle = <T>(p: Promise<T>) => p.catch((err: Error) => `could not read: ${err.message}`);
    const ctx = await buildCtx(d.client, c.id, token, () => Promise.reject(new Error("read only"))).catch((err: Error) => {
      throw new Error(err instanceof BuildRefused ? err.message : `Meta: ${err.message}`);
    });
    const [files, videos, forms] = await Promise.all([
      settle(listAdCreatives(d.client, c.id).then((fs) => fs.map((f) => ({ file_id: f.id, name: f.name, kind: f.kind, width: f.width, height: f.height })))),
      settle(libraryVideos(ctx).then((vs) => vs.filter((v) => v.ready).map((v) => ({ video_id: v.id, name: v.name })))),
      settle(pageForms(ctx).then((fs) => fs.map((f) => ({ lead_form_id: f.id, name: f.name, status: f.status })))),
    ]);
    return `# Ad assets: ${c.name}\n${json({ creativesFiles: files, libraryVideos: videos, leadForms: forms })}`;
  },
};

// ---------- Builds ----------

const buildArgs = {
  ...clientArg,
  bot: { type: "string", description: "Your name, for the change log." },
  check_only: { type: "boolean", description: "true: Meta validates it, nothing is created." },
};

/** A Meta build: check_only runs straight through; a real one is logged first. */
function metaTool(name: string, description: string, props: Record<string, unknown>, required: string[], build: (ctx: BuildCtx, a: Args, check: boolean) => Promise<Row>): ToolDef<GrokDeps> {
  return {
    name,
    description,
    inputSchema: schema({ ...buildArgs, ...props }, ["client", ...required]),
    run: async (d, a) => {
      const c = await findClient(d.client, a.client);
      const ctx = await ctxFor(d, c);
      if (a.check_only === true) return json(await said(build(ctx, a, true)));
      return json(await audited(d.client, name, c.id, { bot: botName(a.bot), args: a }, () => said(build(ctx, a, false))));
    },
  };
}

const metaCreateCampaign = metaTool(
  "meta_create_campaign",
  "Create a PAUSED Leads campaign with a campaign budget (CBO). daily_budget_usd is at most the Ads plan's daily spend (or $100 with no plan).",
  { name: { type: "string" }, daily_budget_usd: { type: "number" } },
  ["name", "daily_budget_usd"],
  createCampaign,
);

const metaCreateAdset = metaTool(
  "meta_create_adset",
  "Create a PAUSED ad set in a Leads campaign: Instant Forms, maximise leads, the client's zip codes (max 20), ages 18 to 65+, Facebook and Instagram feeds, stories and reels only, starts the next midnight in the account's time zone.",
  { campaign_id: { type: "string" }, name: { type: "string" }, zips: { type: "array", items: { type: "string" } } },
  ["campaign_id", "name", "zips"],
  createAdset,
);

const metaCreateAd = metaTool(
  "meta_create_ad",
  "Create a PAUSED lead form ad: an image from the app's Creatives (file_id) or a ready video in the Meta library (video_id), both from get_ad_assets; primary text and headline; the lead form; creative enhancements off; a UTM string (default set for you). cta defaults to GET_QUOTE.",
  {
    adset_id: { type: "string" },
    name: { type: "string" },
    lead_form_id: { type: "string" },
    file_id: { type: "string" },
    video_id: { type: "string" },
    primary_text: { type: "string" },
    headline: { type: "string" },
    description: { type: "string" },
    cta: { type: "string", enum: ["GET_QUOTE", "SIGN_UP", "LEARN_MORE", "APPLY_NOW", "CONTACT_US", "BOOK_NOW"] },
    url_tags: { type: "string" },
  },
  ["adset_id", "name", "lead_form_id", "primary_text", "headline"],
  createAd,
);

export const META_TOOLS: ToolDef<GrokDeps>[] = [
  getAdResults,
  getAdStructure,
  getAdAssets,
  metaCreateCampaign,
  metaCreateAdset,
  metaCreateAd,
  ...META_REQUEST_TOOLS,
];
