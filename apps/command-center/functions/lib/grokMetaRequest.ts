import { GRAPH, graphGet, graphGetAll } from "./metaGraph";
import { listReachablePages, type ReachablePage } from "./metaPages";
import { resolveMetaToken } from "./metaToken";
import { audited, botName, listClients, type GrokDeps, type ToolDef } from "./grokMcp";

// All of Meta for the bots (Jake, 2026-10-28: "access to literally everything
// except changing adspend"; switching things on or off: "Neither"). Any Graph
// API call on every ad account and Page the agency's System User reaches, with
// a Page's own token when the call is on a Page.
//
// What stays is the spend lock, the log and the host:
//   - spendCheck refuses any budget, bid or spend cap, ad rules (which change
//     budgets and switch ads by themselves), Meta's batch calls and its method
//     switch (either could carry a write past the lock), and any change that
//     switches a campaign, ad set or ad on or off. New ones and copies are made
//     PAUSED. A running one cannot be deleted or archived, since that switches
//     it off. Paths are plain characters only, so nothing hides behind Meta
//     decoding them, and the lock reads exactly the fields that are sent.
//   - every call that is not a GET is an admin_audit_log row
//     `grok:meta_request` before it is sent (lib/grokMcp.ts audited);
//   - the token only ever goes to graph.facebook.com, is never asked for, and
//     is scrubbed from everything sent back, Meta's paging links included.

type Row = Record<string, unknown>;
type Verdict = { refuse: string } | { lookup: string; deleting: boolean } | { ok: true; inject: Record<string, string> };
export type Found = { kind: "ad"; status: string } | { kind: "rule" } | { kind: "other" };

const BASE = new URL(GRAPH);
export const META_ORIGIN = BASE.origin;
const VERSION = BASE.pathname; // "/v21.0"
const METHODS = ["GET", "POST", "DELETE"] as const;
type Method = (typeof METHODS)[number];
const TIMEOUT_MS = 25_000;

/** The full Graph URL for a path and query, or an error the bot can act on. */
export function metaUrl(path: unknown, query: unknown): URL {
  if (typeof path !== "string" || !/^\/([A-Za-z0-9_]+(\/[A-Za-z0-9_]+)*)?$/.test(path)) {
    throw new Error('path is a Graph API path of letters, digits and _ starting with "/", e.g. /act_123/campaigns or /{page_id}/feed');
  }
  const url = new URL(GRAPH + path);
  if (url.origin !== META_ORIGIN || !url.pathname.startsWith(`${VERSION}/`)) throw new Error("path must stay on the Graph API");
  if (query !== undefined && query !== null) {
    if (typeof query !== "object" || Array.isArray(query)) throw new Error("query is an object of name: value");
    for (const [k, v] of Object.entries(query as Row)) {
      if (k === "access_token") throw new Error("access_token is added for you; leave it out");
      if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  }
  return url;
}

export function metaMethod(v: unknown): Method {
  const m = typeof v === "string" ? v.toUpperCase() : "GET";
  if (!(METHODS as readonly string[]).includes(m)) throw new Error(`method is one of ${METHODS.join(", ")}`);
  return m as Method;
}

// ---------- The spend lock ----------

// Every field that sets how much is spent, or how fast. Bids count: a higher
// bid cap spends more of the same budget.
const SPEND_KEYS = new Set([
  "budget", "daily_budget", "lifetime_budget", "spend_cap", "spend_cap_action", "daily_spend_cap", "lifetime_spend_cap",
  "daily_min_spend_target", "lifetime_min_spend_target", "budget_rebalance_flag", "budget_schedule_specs",
  "is_budget_schedule_enabled", "adset_budgets", "bid_amount", "bid_strategy", "bid_constraints", "bid_adjustments",
  "pacing_type", "is_adset_budget_sharing_enabled",
]);
const SPEND_EDGES = new Set(["budget_schedules", "reachfrequencypredictions"]);
const RULE_KEYS = new Set(["execution_spec", "evaluation_spec"]);

// Fields that switch a campaign, ad set or ad on or off, now or on a schedule.
const SWITCH_KEYS = new Set(["status", "configured_status", "start_time", "end_time", "stop_time", "time_start", "time_stop", "adset_schedule"]);
const AD_EDGES = new Set(["campaigns", "adsets", "ads"]);
const GONE = new Set(["DELETED", "ARCHIVED"]);

const BUDGET = "Budgets, bids and spend caps are Jake's. Nothing was sent.";
const RULES = "Ad rules change budgets and switch ads on and off by themselves, so they are Jake's. Nothing was sent.";
const BATCH = "Meta's batch calls are refused, since one could carry a budget past the lock. Send each call on its own.";
const METHOD = "Meta's method field turns one kind of call into another, so it is refused. Use method on the tool instead.";
const TOKEN = "Tokens are never handed out. Leave access_token out.";
const SWITCH_ON = "Switching campaigns, ad sets or ads on is Jake's call. Leave the status out and it is made PAUSED.";
const SWITCH = "Switching a campaign, ad set or ad on or off, or changing its schedule, is Jake's call. Nothing was sent.";
const RUNNING = "It is on. Deleting or archiving it would switch it off, which is Jake's call. Nothing was sent.";
const BULK = "Deleting a whole account's campaigns, ad sets or ads is refused. Delete paused ones one at a time.";

// Deeper than any real Meta spec; past it the rest is read as text.
const MAX_DEPTH = 16;

/** A key written as a field (followed by : or =) in text that could not be read as JSON. */
function keyInText(t: string, keys: Set<string>): boolean {
  return [...keys].some((k) => new RegExp(`\\b${k}\\b["']?\\s*[:=]`).test(t));
}

/**
 * Does a key from `keys` appear anywhere in v, JSON text included (Meta parses
 * it)? Fails closed: what it cannot walk, it reads as text.
 */
function hasKey(v: unknown, keys: Set<string>, depth = 0): boolean {
  if (depth > MAX_DEPTH) return keyInText(JSON.stringify(v) ?? "", keys);
  if (typeof v === "string") {
    const t = v.trim();
    if (!/^[[{]/.test(t)) return false;
    try {
      return hasKey(JSON.parse(t), keys, depth + 1);
    } catch {
      return keyInText(t, keys);
    }
  }
  if (Array.isArray(v)) return v.some((x) => hasKey(x, keys, depth + 1));
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => keys.has(k) || hasKey(x, keys, depth + 1));
  return false;
}

/**
 * What the lock says about one call, before anything is logged or sent.
 * `lookup` means it depends on what the object is: see objectRule.
 * `inject` is merged over the fields, so new campaigns, ad sets, ads and
 * copies are always made PAUSED (Meta's own default for a new ad is ACTIVE).
 */
export function spendCheck(method: Method, path: string, params: Row): Verdict {
  const ok = (inject: Record<string, string> = {}): Verdict => ({ ok: true, inject });
  if ("method" in params) return { refuse: METHOD };
  if ("batch" in params) return { refuse: BATCH };
  if (/access_token/.test(JSON.stringify(params))) return { refuse: TOKEN };
  if (method === "GET") return ok();
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0 || segs.includes("async_batch_requests")) return { refuse: BATCH };
  if (segs.includes("adrules_library") || hasKey(params, RULE_KEYS)) return { refuse: RULES };
  if (segs.some((s) => SPEND_EDGES.has(s)) || hasKey(params, SPEND_KEYS)) return { refuse: BUDGET };
  const [id, edge] = segs;
  const accountEdge = segs.length === 2 && /^act_\d+$/.test(id) && AD_EDGES.has(edge);
  if (method === "DELETE") {
    if (segs.length === 1) return { lookup: id, deleting: true };
    return accountEdge ? { refuse: BULK } : ok();
  }
  if (accountEdge) {
    if (["status", "configured_status"].some((k) => params[k] !== undefined && params[k] !== "PAUSED")) return { refuse: SWITCH_ON };
    return ok({ status: "PAUSED" });
  }
  if (segs.length === 2 && edge === "copies") {
    if (params.status_option !== undefined && params.status_option !== "PAUSED") return { refuse: SWITCH_ON };
    return ok({ status_option: "PAUSED" });
  }
  if (segs.length === 1 && Object.keys(params).some((k) => SWITCH_KEYS.has(k))) {
    return { lookup: id, deleting: GONE.has(String(params.status)) };
  }
  return ok();
}

/**
 * The rule for one object. A campaign, ad set or ad is never switched on or
 * off, and is deleted or archived only while it is off. Ad rules are left
 * alone entirely: enabling one can raise a budget or switch an ad on.
 */
export function objectRule(found: Found, deleting: boolean): string | null {
  if (found.kind === "other") return null;
  if (found.kind === "rule") return RULES;
  if (!deleting) return SWITCH;
  return found.status === "ACTIVE" ? RUNNING : null;
}

/**
 * What an object is. Only campaigns, ad sets and ads carry effective_status,
 * and only ad rules carry evaluation_spec (Meta no longer says an object's
 * type outright). Asked with the agency's token first, a Page's only if the
 * agency's is refused.
 */
async function findObject(sys: string, token: string, id: string, secrets: string[]): Promise<Found> {
  const read = async (fields: string): Promise<Row | null> => {
    let last: Error | null = null;
    for (const t of new Set([sys, token])) {
      try {
        return JSON.parse(await send(t, "GET", metaUrl(`/${id}`, { fields }), {}, secrets)) as Row;
      } catch (err) {
        if (/nonexisting field/.test((err as Error).message)) return null;
        last = err as Error;
      }
    }
    throw new Error(`could not check what ${id} is, so nothing was sent: ${last?.message}`);
  };
  const ad = await read("status,effective_status");
  if (ad) return { kind: "ad", status: String(ad.status ?? "") };
  return (await read("evaluation_spec")) ? { kind: "rule" } : { kind: "other" };
}

// ---------- Sending ----------

/** The tokens, wherever Meta echoes them: page lists, paging links, errors, anything shaped like one. */
export function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("[hidden]");
  return out
    .replace(/("access_token"\s*:\s*")[^"]*"/g, '$1[hidden]"')
    .replace(/(access_token=)[^&"\s\\]+/g, "$1[hidden]")
    .replace(/EAA[A-Za-z0-9]{20,}/g, "[hidden]");
}

async function send(token: string, method: Method, url: URL, body: Row, secrets: string[]): Promise<string> {
  const init: RequestInit = { method, signal: AbortSignal.timeout(TIMEOUT_MS) };
  const target = new URL(url.href);
  if (method === "POST") {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) form.set(k, typeof v === "string" ? v : JSON.stringify(v));
    form.set("access_token", token);
    init.body = form;
  } else {
    for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) target.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    target.searchParams.set("access_token", token);
  }
  const res = await fetch(target.href, init);
  const text = scrub(await res.text(), secrets);
  if (!res.ok) throw new Error(`Meta ${method} ${url.pathname} returned ${res.status}: ${text.slice(0, 2000)}`);
  return text || `${res.status} OK`;
}

async function agencyToken(d: GrokDeps): Promise<string> {
  const token = await resolveMetaToken(d.env);
  if (!token) throw new Error("Meta is not connected for the agency.");
  return token;
}

// The Pages and their tokens, kept ten minutes per isolate: most calls start
// with a numeric id, and listing the Pages for each would double them.
let pageCache: { sys: string; at: number; pages: ReachablePage[] } | null = null;

async function reachablePages(sys: string): Promise<ReachablePage[]> {
  if (pageCache?.sys === sys && Date.now() - pageCache.at < 600_000) return pageCache.pages;
  const pages = await listReachablePages(sys);
  pageCache = { sys, at: Date.now(), pages };
  return pages;
}

/**
 * The token for a call: the named Page's, or the Page's whose id starts the
 * path (a Page's posts are `<page>_<post>`), else the agency's. A Page call
 * with the agency token is refused by Meta.
 */
async function tokenFor(sys: string, first: string | undefined, page: unknown): Promise<{ token: string; pageId: string | null; secrets: string[] }> {
  const named = typeof page === "string" && page.trim();
  if (!named && !/^\d+(_\d+)?$/.test(first ?? "")) return { token: sys, pageId: null, secrets: [sys] };
  const pages = await reachablePages(sys);
  const secrets = [sys, ...pages.map((p) => p.accessToken)];
  const hit = named ? pickPage(pages, named) : pages.find((p) => first === p.id || first?.startsWith(`${p.id}_`));
  return hit ? { token: hit.accessToken, pageId: hit.id, secrets } : { token: sys, pageId: null, secrets };
}

/** A Page by id or name: exact first, then a unique part, never a guess. */
export function pickPage<P extends { id: string; name: string }>(pages: P[], query: string): P {
  const q = query.toLowerCase().trim();
  const exact = pages.filter((p) => p.id === q || p.name.toLowerCase() === q);
  const hits = exact.length ? exact : pages.filter((p) => p.name.toLowerCase().includes(q));
  if (hits.length === 1) return hits[0];
  const all = pages.map((p) => `${p.name} (${p.id})`).join(", ");
  throw new Error(hits.length ? `"${query}" matches ${hits.map((p) => p.name).join(", ")}. Say which.` : `No Page called "${query}". Pages: ${all}`);
}

/** The fields as the log keeps them: an upload's bytes are noted, not stored. */
function forLog(body: Row): Row {
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "string" && v.length > 2000 ? `[${v.length} characters]` : v]));
}

/**
 * The client a write is about, for the log: by ad account, Page, or the ad
 * account a campaign, ad set, ad or creative sits in. Unknown is null; the
 * row still names the path.
 */
async function tenantOf(d: GrokDeps, sys: string, first: string | undefined, pageId: string | null, secrets: string[]): Promise<string | null> {
  let account = first?.startsWith("act_") ? first : null;
  if (!account && !pageId && first && /^\d+$/.test(first)) {
    account = await send(sys, "GET", metaUrl(`/${first}`, { fields: "account_id" }), {}, secrets)
      .then((t) => {
        const id = (JSON.parse(t) as Row).account_id;
        return id ? `act_${String(id)}` : null;
      })
      .catch(() => null);
  }
  const { data, error } = await d.client.from("tenants").select("id, meta_ad_account_id, meta_page_id");
  if (error) return null;
  const acct = (v: unknown) => String(v ?? "").replace(/^act_/, "");
  const hit = ((data ?? []) as Row[]).find((t) => (account && acct(t.meta_ad_account_id) === acct(account)) || (pageId && t.meta_page_id === pageId));
  return hit ? String(hit.id) : null;
}

// ---------- Tools ----------

const metaAccounts: ToolDef<GrokDeps> = {
  name: "meta_accounts",
  description:
    "Every Meta ad account and Facebook Page the agency reaches, each with its client, plus the permissions the agency's Meta access holds. account_status 1 is active.",
  inputSchema: { type: "object", properties: {}, required: [] },
  run: async (d) => {
    const token = await agencyToken(d);
    const [accounts, pages, perms, clients, rows] = await Promise.all([
      graphGetAll(token, "/me/adaccounts", { fields: "account_id,name,account_status,currency,timezone_name", limit: "100" }),
      reachablePages(token),
      graphGet(token, "/me/permissions", {}),
      listClients(d.client),
      d.client.from("tenants").select("id, meta_ad_account_id, meta_page_id"),
    ]).catch((err: Error) => {
      throw new Error(scrub(`Meta said no: ${err.message}`, [token]));
    });
    if (rows.error) throw new Error(`clients: ${rows.error.message}`);
    const names = new Map(clients.map((c) => [c.id, c.name]));
    const tenants = ((rows.data ?? []) as Row[]).filter((t) => names.has(String(t.id)));
    const by = (key: string, v: string) => names.get(String(tenants.find((t) => String(t[key] ?? "").replace(/^act_/, "") === v)?.id)) ?? null;
    const granted = ((perms.data as Row[] | undefined) ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
    const out = {
      adAccounts: accounts.map((a) => ({ id: a.id, name: a.name, client: by("meta_ad_account_id", String(a.account_id)), account_status: a.account_status, currency: a.currency, timezone: a.timezone_name })),
      pages: pages.map((p) => ({ id: p.id, name: p.name, client: by("meta_page_id", p.id) })),
      permissions: granted,
    };
    return JSON.stringify(out, null, 1);
  },
};

const metaRequest: ToolDef<GrokDeps> = {
  name: "meta_request",
  description:
    "Any Meta Graph API v21.0 call: ad accounts, campaigns, ad sets, ads, creatives, images and videos, audiences, pixels, insights, Pages, posts, lead forms and leads. A call on a Page uses that Page's token (named in page, or found from a path starting with the Page id; lead forms and leads need page). Refused: budgets, bids and spend caps; ad rules; switching a campaign, ad set or ad on or off or changing its schedule; deleting or archiving one that is on; batch calls. New campaigns, ad sets, ads and copies are made PAUSED. Anything but GET is logged before it is sent.",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", enum: [...METHODS], description: "Default GET." },
      path: { type: "string", description: "Graph API path, e.g. /act_123/campaigns, /{campaign_id}, /{page_id}/feed, /{form_id}/leads." },
      query: { type: "object", description: "Query string as name: value, e.g. { fields: \"id,name,status\", limit: 100 }. Arrays and objects are sent as JSON." },
      body: { type: "object", description: "Fields for POST. Arrays and objects (targeting, object_story_spec) are sent as JSON." },
      page: { type: "string", description: "A Page id or name from meta_accounts, to use that Page's token." },
      bot: { type: "string", description: "Your name, for the change log." },
    },
    required: ["path"],
  },
  run: async (d, a) => {
    const method = metaMethod(a.method);
    const url = metaUrl(a.path, a.query);
    if (a.body !== undefined && a.body !== null && (typeof a.body !== "object" || Array.isArray(a.body))) throw new Error("body is an object of name: value");
    // One copy of every field, the query folded in: what the lock reads is exactly what is sent.
    const fields: Row = { ...Object.fromEntries(url.searchParams), ...((a.body ?? {}) as Row) };
    url.search = "";
    const path = url.pathname.slice(VERSION.length);
    const verdict = spendCheck(method, path, fields);
    if ("refuse" in verdict) throw new Error(verdict.refuse);
    const first = path.split("/").filter(Boolean)[0];
    const sys = await agencyToken(d);
    const { token, pageId, secrets } = await tokenFor(sys, first, a.page);
    if ("lookup" in verdict) {
      const why = objectRule(await findObject(sys, token, verdict.lookup, secrets), verdict.deleting);
      if (why) throw new Error(why);
    }
    const params = "inject" in verdict ? { ...fields, ...verdict.inject } : fields;
    const go = () => send(token, method, url, params, secrets);
    if (method === "GET") return go();
    const payload = { bot: botName(a.bot), method, path, page: pageId, fields: forLog(params) };
    return audited(d.client, "meta_request", await tenantOf(d, sys, first, pageId, secrets), payload, go);
  },
};

export const META_REQUEST_TOOLS: ToolDef<GrokDeps>[] = [metaAccounts, metaRequest];
