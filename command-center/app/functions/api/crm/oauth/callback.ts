import type { Env } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logError } from "../../../lib/errorLog";
import {
  exchangeCode,
  loadAgencyInstall,
  saveInstall,
  verifyInstallState,
} from "../../../lib/ghlApp";

// GET /api/crm/oauth/callback?code=...&state=...
//
// Where GoHighLevel sends the agency admin's browser after they install the
// Marketplace app. Public by necessity (a redirect target carries no session of
// ours), guarded by the signed state the Connection page mints.
//
// Path is /api/crm/, not /api/ghl/: a white-label marketplace listing refuses
// any redirect URL containing a HighLevel reference, and "ghl" is one.
//
// This writes ONE row: the agency (company) install, stored with location_id ''.
// Per-sub-account tokens are minted lazily from it on first use, so there is
// nothing to enumerate here and no partial state if a single sub-account fails.
//
// Always redirects rather than returning JSON. A human is looking at this.

function back(origin: string, params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  // Client setup is where the install now starts (the Sub-account card's
  // Install button), so it is where the browser comes back to.
  return Response.redirect(`${origin}/admin/onboarding?${qs}`, 302);
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  // A refused install used to leave nothing behind but a console line nobody
  // reads and a query parameter on a page that ignored it. The install happens
  // once, in somebody else's browser, so the only durable record of why it
  // failed has to be written here.
  const refuse = async (reason: string, context: Record<string, unknown> = {}) => {
    await logError(ctx.env, "crm.install", `install refused: ${reason}`, context).catch(
      () => undefined,
    );
    return back(origin, { install: "error", reason });
  };

  if (!code) return refuse("no_code", { query: url.search.slice(0, 200) });

  if (!(await verifyInstallState(ctx.env, state))) {
    // Either a forged callback or a stale one. Both are "start again from the
    // page", and neither should be allowed to write an install row.
    return refuse("bad_state", { hadState: Boolean(state) });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return refuse("no_database");

  try {
    const token = await exchangeCode(
      ctx.env,
      code,
      `${origin}/api/crm/oauth/callback`,
    );

    const companyId = token.companyId ?? "";
    if (!companyId) {
      // A Location-type token arrives without a companyId and cannot mint
      // anything. Refuse it rather than store a token that will fail silently
      // on the first sub-account read. In practice this means the install was
      // approved for ONE sub-account instead of the agency.
      return await refuse("not_agency", {
        userType: token.userType ?? null,
        locationId: token.locationId ?? null,
        scope: token.scope ?? null,
      });
    }

    // Refuse a second, different agency. loadAgencyInstall takes the newest
    // row, so accepting a foreign companyId would silently repoint every
    // sub-account token mint at somebody else's account.
    const existing = await loadAgencyInstall(client);
    if (existing && existing.company_id !== companyId) {
      return await refuse("other_agency", {
        arrived: companyId,
        alreadyInstalled: existing.company_id,
      });
    }

    await saveInstall(client, companyId, "", token, null);
    console.log("[crm] agency install stored for company", companyId);
    return back(origin, { install: "ok" });
  } catch (err) {
    // The message carries GoHighLevel's own refusal text, which is the only
    // thing that distinguishes a wrong secret from a mismatched redirect URI.
    return await refuse("exchange_failed", { detail: (err as Error).message.slice(0, 500) });
  }
};
