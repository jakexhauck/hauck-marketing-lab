import { type Env, type ApiData } from "../../lib/env";
import { buildAdsMedia, type AdsMediaResponse } from "../../lib/adsMedia";

// Re-exported so existing importers (this file's own type usage) can keep
// reading AdsMediaResponse from "./media"; the real shaping now lives in
// ../../lib/adsMedia, shared with the admin Fulfillment cockpit's per-tenant
// Media view.
export type { AdsMediaResponse };

// Thin wrapper for the client's own Paid Ads "Media" tab: resolves the
// session-derived tenant's Meta account, then hands off to the shared
// adsMedia.buildAdsMedia core. Same shared System-User token and per-client
// account as insights.ts, so one client can never see another's media.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  // This client's own ad account, or none. The env META_AD_ACCOUNT_ID is not
  // consulted: it names a real client's account, so inheriting it showed one
  // client another client's spend and creatives under their own name.
  const result = await buildAdsMedia(
    ctx.env.META_SYSTEM_USER_TOKEN,
    ctx.data.tenant?.meta_ad_account_id,
    undefined,
  );
  return Response.json(result);
};
