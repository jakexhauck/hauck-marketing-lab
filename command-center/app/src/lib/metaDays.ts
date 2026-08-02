import type { MetaDataRow } from "./api";

// MetaDataRow comes from the CLIENT contract in lib/api.ts, not from the Worker
// file that also declares it. The two build against separate tsconfigs, so
// importing across pulls Cloudflare's globals into the browser build and it
// stops compiling. Same reason sopHub.ts restates its shapes.

// Rolling the raw Meta feed up into one row per day.
//
// meta_ad_days stores one row per AD per day, which is what the page showed: on
// a day with three ads live it drew three rows, and reading a day's spend meant
// adding them in your head. The ads are still there, one click down.
//
// Pure, so the arithmetic a budget decision rests on is unit tested rather than
// eyeballed in a table.

export interface MetaDay {
  date: string;
  spend: number;
  impressions: number;
  // The SUM of each ad's reach, which is an upper bound and not the day's real
  // reach. See reachIsExact below: this number is only true when one ad ran.
  reach: number;
  linkClicks: number;
  // Every ad that ran, biggest spender first. That order is the point of
  // opening a day: the ad taking the budget should be the first thing read.
  ads: MetaDataRow[];
}

/**
 * Is a day's reach a real figure, or merely an upper bound?
 *
 * Reach is UNIQUE PEOPLE. Meta de-duplicates it within one ad, but adding two
 * ads together counts anybody who saw both of them twice, and there is no way to
 * recover the overlap from this data: the de-duplicated total is a number only
 * Meta can compute.
 *
 * So it is exact for a day with a single ad and an over-count for any other, and
 * the page says which rather than printing both the same way. Spend, impressions
 * and clicks are all straight counts of events and add up correctly, which is
 * why reach is the only column that needs this.
 */
export function reachIsExact(day: MetaDay): boolean {
  return day.ads.length <= 1;
}

/**
 * One row per day, newest first, each carrying the ads that made it.
 *
 * Days are keyed on the date string exactly as stored, so nothing here can shift
 * a row across a timezone boundary.
 */
export function groupMetaDaysByDate(rows: readonly MetaDataRow[]): MetaDay[] {
  const byDate = new Map<string, MetaDay>();

  for (const row of rows) {
    if (!row.date) continue;
    let day = byDate.get(row.date);
    if (!day) {
      day = { date: row.date, spend: 0, impressions: 0, reach: 0, linkClicks: 0, ads: [] };
      byDate.set(row.date, day);
    }
    day.spend += row.spend;
    day.impressions += row.impressions;
    day.reach += row.reach;
    day.linkClicks += row.linkClicks;
    day.ads.push(row);
  }

  for (const day of byDate.values()) {
    // Biggest spender first; ties fall back to the ad name so the order is
    // stable between reads rather than following whatever order the rows
    // happened to arrive in.
    day.ads.sort((a, b) => b.spend - a.spend || a.adName.localeCompare(b.adName));
  }

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Totals across every day on screen, for the footer. */
export function totalMetaDays(days: readonly MetaDay[]): Omit<MetaDay, "date" | "ads"> {
  return days.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      impressions: acc.impressions + d.impressions,
      reach: acc.reach + d.reach,
      linkClicks: acc.linkClicks + d.linkClicks,
    }),
    { spend: 0, impressions: 0, reach: 0, linkClicks: 0 },
  );
}
