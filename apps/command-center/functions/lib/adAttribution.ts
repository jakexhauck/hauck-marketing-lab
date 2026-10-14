// Reading Meta ad attribution off a GHL contact.
//
// Where this data actually lives, because it is not where you would expect:
// the location has utm_ad_id / utm_adset_id / utm_campaign_id custom fields,
// and they are DEAD. Measured 2026-07-19 across 100 live Willis contacts: 0
// populated. Nothing writes to them. `attributionFromCustomFields()` in ghl.ts
// reads four of that family and returns null in practice.
//
// The real data is the `attributions[]` array GHL already returns on the bulk
// contacts list, present on 99 of those same 100 contacts. No per-contact
// fetch is needed.
//
// Note there is no ad set id in here. `mediumId` is the Facebook Page id, which
// is constant across every ad. Ad set and campaign grouping is resolved by
// joining adId against the Meta snapshot (meta_ad_days), which carries both.

export interface GhlAttribution {
  // The join key. Only present on paid-social touches.
  utmAdId?: string;
  utmCampaignId?: string;
  // Display names. Free text, and they drift when an ad is renamed, so these
  // label rows but never key them.
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  utmSource?: string;
  utmSessionSource?: string;
  adSource?: string;
  medium?: string;
  mediumId?: string;
  pageUrl?: string;
  referrer?: string;
  isFirst?: boolean;
  isLast?: boolean;
}

export interface AdAttribution {
  adId: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetName: string | null;
  adName: string | null;
}

function clean(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}

// First-touch attribution: the ad that acquired the lead earns the credit.
//
// "First touch" is scoped to touches that carry an ad. A contact who found the
// site organically and only later clicked an ad is credited to that ad, since
// an ad tracker cannot attribute an organic touch to anything. A contact who
// never touched an ad returns null and is counted as unattributed.
export function firstTouchAttribution(
  attributions: GhlAttribution[] | undefined | null,
): AdAttribution | null {
  if (!Array.isArray(attributions) || attributions.length === 0) return null;

  const withAd = attributions.filter((a) => clean(a?.utmAdId));
  if (withAd.length === 0) return null;

  const chosen = withAd.find((a) => a.isFirst) ?? withAd[0];

  return {
    adId: clean(chosen.utmAdId)!,
    campaignId: clean(chosen.utmCampaignId),
    campaignName: clean(chosen.utmCampaign),
    // utmMedium carries the ad set name and utmContent the ad name, which is
    // Meta's URL-parameter convention, not something GHL labels for us.
    adsetName: clean(chosen.utmMedium),
    adName: clean(chosen.utmContent),
  };
}
