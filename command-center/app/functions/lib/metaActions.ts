// How many conversions did Meta report on this insights row?
//
// Lived inside adsCore.ts until 2026-08-13, when the nightly meta_ad_days
// snapshot started needing the same answer. Two copies of this arithmetic is
// how the Paid Ads dashboard and the Paid Ads overview would come to disagree
// about a single client's lead count, so there is one, here, and both import it.
//
// Nothing in this module does network or database work. It reads one Graph
// insights row and returns a number.

// The conversion action types that count as a "lead"/result, matching the
// desktop app's meta_ads.rs. A client on a non-standard action type simply
// reads zero results (never a fabricated number).
//
// Grouped, not a flat set, and that is the whole point. Meta does not report
// disjoint action types: it reports a ROLL-UP alongside the components that make
// it up. Willis Windows, August 2026, one account, one month:
//
//   lead                             26   <- Meta's own roll-up
//   offsite_conversion.fb_pixel_lead  22
//   onsite_conversion.lead_grouped     4
//
// 22 + 4 = 26. Summing all three (which a flat set does) returned 52, so the
// client's Overview read "52 new leads" at "$4.72 each" when the truth was 26 at
// $9.44: exactly double, exactly half, and plausible enough to go unnoticed for
// weeks. Purchases would have been counted three times the same way.
//
// So each group names its roll-up first. Take the roll-up when Meta reports it;
// only fall back to summing the components when it is absent (an account that
// runs one conversion type sometimes gets the component and no roll-up). Sum
// ACROSS groups, never within one.
//
// Why not Meta's own `results` field, which is literally the Ads Manager
// column? Because it does not answer for every campaign. Probed live against
// Willis on 2026-08-13, same account, last 30 days:
//
//   7/15/26 | Lead Form | Willis Windows            lead=12  results=(none)
//   7/15/26 | Lead Form | Willis Windows - Copy     lead= 1  results=(none)
//   7/24/26 | Lead Form | Willis Windows | $20/Day  lead=14  results=(none)
//   8/5/26  | LP        | Willis Windows | $20/Day  lead=24  results=24
//
// `results` is empty for all three Instant Form campaigns and populated only for
// the landing-page one, and at account level it degrades to
// `[{"indicator":"mixed"}]` with no value at all. Building on it would have
// reported 24 leads where Meta reports 51. The roll-up below sums to exactly 51.
export const ACTION_GROUPS: { rollup: string; parts: string[] }[] = [
  {
    rollup: "lead",
    parts: [
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
      // Present on Willis's account alongside the pixel lead. Only ever read
      // when the `lead` roll-up is missing, so it cannot double-count against
      // the pixel one in the normal case.
      "onsite_web_lead",
      "leadgen.other",
    ],
  },
  {
    rollup: "omni_purchase",
    parts: ["purchase", "offsite_conversion.fb_pixel_purchase"],
  },
  {
    rollup: "complete_registration",
    parts: ["offsite_conversion.fb_pixel_complete_registration"],
  },
];

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Sum the values of the conversion action types in an insights row's `actions`
// (count) or `action_values` (revenue) array, counting each conversion once.
// See ACTION_GROUPS for why "once" needs saying.
export function actionsValue(row: Record<string, unknown>, key: string): number {
  const arr = row[key];
  if (!Array.isArray(arr)) return 0;

  const byType = new Map<string, number>();
  for (const entry of arr) {
    const t = (entry as { action_type?: string }).action_type ?? "";
    if (!t) continue;
    // Meta sends one entry per type, but a duplicated type must add rather than
    // overwrite: losing a conversion is as wrong as counting one twice.
    byType.set(t, (byType.get(t) ?? 0) + num((entry as { value?: unknown }).value));
  }

  let total = 0;
  for (const group of ACTION_GROUPS) {
    const rolled = byType.get(group.rollup);
    if (rolled !== undefined) {
      total += rolled;
      continue;
    }
    for (const part of group.parts) total += byType.get(part) ?? 0;
  }
  return total;
}

// Meta's own attribution setting for the account, rather than the API's default
// of 7-day click / 1-day view. Passed on every insights call so a client whose
// account is set to something else reads the same number their Ads Manager
// shows them.
//
// Measured on Willis 2026-08-13: no effect whatsoever, on any preset. Their
// account setting already equals the API default. It is set for the accounts
// where that is not true, and it is NOT the cause of the discrepancy this
// module was extracted to fix. Do not sell it as one.
export const UNIFIED_ATTRIBUTION = { use_unified_attribution_setting: "true" };
