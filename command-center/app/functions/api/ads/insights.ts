import { tenantTimezone, type Env, type ApiData } from "../../lib/env";
import { resolveAdAccount } from "../../lib/metaGraph";
import {
  buildAdsInsights,
  derivePhase,
  EMPTY_TOTALS,
  type AdsContext,
  type AdsInsightsResponse,
} from "../../lib/adsCore";

// Re-exported so existing importers (this file's own test) can keep reading
// resolveAdAccount/derivePhase from "./insights"; the real implementations now
// live in ../../lib/metaGraph and ../../lib/adsCore respectively.
export { resolveAdAccount, derivePhase };
export type { AdsInsightsResponse };

// Thin wrapper for the client's own Paid Ads tabs (Overview / Insights /
// Creatives): resolves the session-derived tenant's Meta account + GHL
// context, then hands off to the shared adsCore.buildAdsInsights, which
// carries the real shaping/join logic. That core takes an explicit
// { metaAccount, ghlToken, ghlLocationId, zone } context (no ctx.data reads),
// so a future admin endpoint can call the exact same logic for an
// admin-chosen tenantId. See ../../lib/adsCore for the "why" comments.
//
// Golden rule: a real client only ever sees their real numbers. When Meta is
// not configured this handler returns { configured: false } and the tabs show
// their not-connected state; buildAdsInsights degrades any Meta-call failure
// to an honest zeroed payload with an error string, never a fabricated number.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = ctx.env.META_SYSTEM_USER_TOKEN;
  let account = resolveAdAccount(ctx.data.tenant?.meta_ad_account_id, ctx.env.META_AD_ACCOUNT_ID);
  if (!token || !account) {
    // Full empty shape (not a bare { configured: false }) so the client always
    // receives a complete payload and no Paid Ads tab can crash on a missing
    // field before Meta is wired.
    return Response.json({
      configured: false,
      currency: "USD",
      totals: EMPTY_TOTALS,
      lastMonthLeads: 0,
      weekly: [],
      sources: { fb: 0, ig: 0 },
      ads: [],
      phase: null,
    } satisfies AdsInsightsResponse);
  }
  if (!account.startsWith("act_")) account = `act_${account}`;

  const zone = tenantTimezone(ctx.env);
  const tenant = ctx.data.tenant;
  const adsCtx: AdsContext = {
    metaAccount: account,
    ghlToken: tenant?.ghl_token ?? "",
    ghlLocationId: tenant?.ghl_location_id ?? "-",
    zone,
  };
  return Response.json(await buildAdsInsights(ctx.env, adsCtx));
};
