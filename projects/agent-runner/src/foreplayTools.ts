// Foreplay's public API for the Market Research and Ads agents: find a brand,
// read its ads (copy, headline, transcript, CTA, how long it has run), search
// every ad Foreplay holds, and the credits left. FOREPLAY_API_KEY reaches the
// runner with Doppler's prd secrets. The host is fixed, so nothing a model
// types can aim this elsewhere.
//
// Credits (Foreplay's docs, checked live 2026-10-22): a brand lookup is 1 per
// call, ads are 1 per ad returned, usage is free, an empty answer is free. The
// free grant is 10,000 a month, so a call returns 25 ads at most and one turn
// spends TURN_CAP at most.

const BASE = "https://public.api.foreplay.co/api";
export const TURN_CAP = 100;
const MAX_LIMIT = 25;

export interface ForeplayDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface ForeplayOpts {
  limit?: number;
  order?: string;
  live?: boolean;
  cursor?: string;
}

type Obj = Record<string, any>;

async function call(d: ForeplayDeps, path: string, params: Record<string, string>): Promise<Obj> {
  const f = d.fetchImpl ?? fetch;
  const res = await f(`${BASE}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: d.apiKey },
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await res.json().catch(() => ({}))) as Obj;
  if (!res.ok || body.metadata?.success === false) {
    const msg = body.error?.message ?? body.error ?? body.metadata?.message ?? body.detail ?? "no answer";
    throw new Error(`Foreplay ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return body;
}

const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}...` : t;
};

const day = (ms: unknown) => (typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : "?");

function brandLine(b: Obj): string {
  return `- ${b.name ?? "?"} | ${b.category ?? "no category"} | ${b.active_ads_count ?? 0} live of ${b.ads_count ?? 0} ads | ${b.url ?? ""} | id ${b.id}`;
}

// A carousel or DCO ad keeps its copy and media in cards, not at the top
// (Window Nation's long runners, live 2026-10-22), so the first card fills in.
function adBlock(a: Obj): string {
  const cards = (Array.isArray(a.cards) ? a.cards : []) as Obj[];
  const c = cards[0] ?? {};
  const headline = a.headline || c.headline || c.title;
  const body = a.description || c.description;
  const transcript = a.full_transcription || c.full_transcription;
  const media = a.video || a.image || c.video || c.image;
  const lines = [
    `- ${a.name ?? "?"} | started ${day(a.started_running)}, ${a.running_duration?.days ?? "?"} days | ${a.display_format ?? a.type ?? "?"}${cards.length > 1 ? `, ${cards.length} versions` : ""} | ${a.live ? "live" : "off"} | CTA ${a.cta_type ?? "none"}`,
  ];
  if (headline) lines.push(`  Headline: ${clip(headline, 200)}`);
  if (body) lines.push(`  Text: ${clip(body, 600)}`);
  if (transcript) lines.push(`  Transcript: ${clip(transcript, 800)}`);
  if (media) lines.push(`  Media: ${media}`);
  if (a.link_url) lines.push(`  Lands on: ${a.link_url}`);
  if (a.foreplay_url) lines.push(`  Foreplay: ${a.foreplay_url}`);
  return lines.join("\n");
}

function adParams(o: ForeplayOpts): Record<string, string> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(o.limit ?? 10)));
  const p: Record<string, string> = { limit: String(limit), live: String(o.live ?? true) };
  if (o.order === "newest" || o.order === "longest_running") p.order = o.order;
  if (o.cursor) p.cursor = o.cursor;
  return p;
}

export interface AdList {
  text: string;
  count: number;
}

function adList(r: Obj): AdList {
  const ads = (r.data ?? []) as Obj[];
  if (!ads.length) return { text: "No ads found (no credits spent).", count: 0 };
  const next = r.metadata?.cursor ? `\nMore: pass cursor ${r.metadata.cursor}` : "";
  return { text: `${ads.length} ads (${ads.length} credits)\n${ads.map(adBlock).join("\n")}${next}`, count: ads.length };
}

export async function foreplayUsage(d: ForeplayDeps): Promise<string> {
  const u = (await call(d, "usage", {})).data ?? {};
  return `${u.remaining_credits ?? "?"} of ${u.total_credits ?? "?"} credits left, until ${String(u.end_date ?? "?").slice(0, 10)}`;
}

// Brands by name ("Window Nation") or by website ("windownation.com").
export async function foreplayBrands(by: "name" | "domain", target: string, d: ForeplayDeps): Promise<string> {
  const q = target.trim();
  if (!q) throw new Error("target is required");
  const r = by === "name" ? await call(d, "discovery/brands", { query: q, limit: "10" }) : await call(d, "brand/getBrandsByDomain", { domain: q, limit: "10" });
  return ((r.data ?? []) as Obj[]).map(brandLine).join("\n") || "No brands found.";
}

// One or more brands' ads, by the ids foreplayBrands gave (commas between).
export async function foreplayBrandAds(ids: string, o: ForeplayOpts, d: ForeplayDeps): Promise<AdList> {
  const list = ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.length > 5 || !list.every((s) => /^[A-Za-z0-9_-]{6,64}$/.test(s))) {
    throw new Error("target must be 1 to 5 brand ids from a brands search, commas between");
  }
  return adList(await call(d, "brand/getAdsByBrandId", { brand_ids: list.join(","), ...adParams(o) }));
}

// Every ad Foreplay holds, by words in the ad ("window replacement").
export async function foreplaySearch(query: string, o: ForeplayOpts, d: ForeplayDeps): Promise<AdList> {
  const q = query.trim();
  if (!q) throw new Error("target is required");
  return adList(await call(d, "discovery/ads", { query: q, ...adParams(o) }));
}

// The tool the bridge serves: one entry for every action, and the per-turn
// cap. An ad call that could take its turn past TURN_CAP is refused.
export function foreplay(d: ForeplayDeps) {
  const spent = new Map<string, number>();
  return async (turn: string, action: string, target: string, o: ForeplayOpts = {}): Promise<string> => {
    if (action === "usage") return foreplayUsage(d);
    if (action === "brands") return foreplayBrands("name", target, d);
    if (action === "domain") return foreplayBrands("domain", target, d);
    if (action !== "brand_ads" && action !== "search") throw new Error("action must be brands, domain, brand_ads, search or usage");
    const used = spent.get(turn) ?? 0;
    const ask = Math.max(1, Math.min(MAX_LIMIT, Math.floor(o.limit ?? 10)));
    if (used + ask > TURN_CAP) {
      throw new Error(`This turn has used ${used} of its ${TURN_CAP} Foreplay credits; ask for fewer ads or tell Jake.`);
    }
    const r = action === "brand_ads" ? await foreplayBrandAds(target, o, d) : await foreplaySearch(target, o, d);
    spent.set(turn, used + r.count);
    if (spent.size > 200) spent.delete(spent.keys().next().value!);
    return r.text;
  };
}
