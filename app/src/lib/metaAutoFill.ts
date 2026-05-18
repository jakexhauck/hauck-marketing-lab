// Maps a MetaAdsAccount → form values for the weekly + monthly report forms.
//
// FormConfig opts in via `metaAutoFill.fieldMap`, which is { formFieldKey: source }
// where `source` is one of the keys below. The mapper formats numbers as plain
// strings (no currency symbol, no commas) so the values drop cleanly into the
// existing text fields and the prompt templates handle formatting.

import type { MetaAd, MetaAdsAccount } from "./mockMetaAds";

export type MetaAutoFillSource =
  | "spend"
  | "leads"
  | "cpl"
  | "roas"
  | "revenue"
  | "ctr"
  | "cpm"
  | "best_ad_name"
  | "best_ad_cpl";

const ALL_SOURCES: readonly MetaAutoFillSource[] = [
  "spend",
  "leads",
  "cpl",
  "roas",
  "revenue",
  "ctr",
  "cpm",
  "best_ad_name",
  "best_ad_cpl",
];

export function isMetaAutoFillSource(s: string): s is MetaAutoFillSource {
  return (ALL_SOURCES as readonly string[]).includes(s);
}

function flattenAds(account: MetaAdsAccount): MetaAd[] {
  const out: MetaAd[] = [];
  for (const c of account.campaigns) {
    for (const s of c.adSets) {
      for (const a of s.ads) out.push(a);
    }
  }
  return out;
}

/** "Best ad" = lowest CPR above a min-spend floor. Falls back to highest
 *  ROAS if no ad clears the floor. Returns null when there are no ads. */
function pickBestAd(account: MetaAdsAccount, minSpend: number): MetaAd | null {
  const ads = flattenAds(account);
  if (ads.length === 0) return null;
  const eligible = ads.filter((a) => a.spend >= minSpend && a.results > 0);
  const pool = eligible.length > 0 ? eligible : ads;
  return pool.reduce((best, cur) => {
    if (!best) return cur;
    const cmp = best.cpr === 0 ? Infinity : best.cpr;
    const curCmp = cur.cpr === 0 ? Infinity : cur.cpr;
    return curCmp < cmp ? cur : best;
  }, null as MetaAd | null);
}

function fmtNum(n: number, fractionDigits = 2): string {
  if (!isFinite(n)) return "0";
  return Number(n.toFixed(fractionDigits)).toString();
}

export interface MetaAutoFillOptions {
  /** Min spend ($) for an ad to qualify as "best". Default 50. */
  bestAdMinSpend?: number;
}

/** Resolve a single source to a string value. */
export function resolveSource(
  source: MetaAutoFillSource,
  account: MetaAdsAccount,
  opts: MetaAutoFillOptions = {},
): string {
  const t = account.totals;
  switch (source) {
    case "spend":
      return fmtNum(t.spend, 2);
    case "leads":
      return fmtNum(t.results, 0);
    case "cpl":
      return fmtNum(t.cpr, 2);
    case "roas":
      return fmtNum(t.roas, 2);
    case "revenue":
      return fmtNum(t.revenue, 2);
    case "ctr":
      return fmtNum(t.ctr, 2);
    case "cpm":
      return fmtNum(t.cpm, 2);
    case "best_ad_name": {
      const best = pickBestAd(account, opts.bestAdMinSpend ?? 50);
      return best?.name ?? "";
    }
    case "best_ad_cpl": {
      const best = pickBestAd(account, opts.bestAdMinSpend ?? 50);
      return best ? fmtNum(best.cpr, 2) : "";
    }
  }
}

/** Map an entire fieldMap → a partial values object. Skips empty values so
 *  user-typed input isn't overwritten with blanks when an account is dry. */
export function mapInsightsToFormFields(
  account: MetaAdsAccount,
  fieldMap: Record<string, string>,
  opts: MetaAutoFillOptions = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [fieldKey, sourceRaw] of Object.entries(fieldMap)) {
    if (!isMetaAutoFillSource(sourceRaw)) continue;
    const value = resolveSource(sourceRaw, account, opts);
    if (value !== "") out[fieldKey] = value;
  }
  return out;
}
