import type { Env } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
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
  return Response.redirect(`${origin}/admin/fulfillment/ghl?sub=connection&${qs}`, 302);
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  if (!code) return back(origin, { install: "error", reason: "no_code" });

  if (!(await verifyInstallState(ctx.env, state))) {
    // Either a forged callback or a stale one. Both are "start again from the
    // page", and neither should be allowed to write an install row.
    console.warn("[crm] install callback rejected: bad or expired state");
    return back(origin, { install: "error", reason: "bad_state" });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return back(origin, { install: "error", reason: "no_database" });

  try {
    const token = await exchangeCode(
      ctx.env,
      code,
      `${origin}/api/crm/oauth/callback`,
    );

    const companyId = token.companyId ?? "";
    if (!companyId) {
      // A Location-type token would arrive without a companyId and could not
      // mint anything. Refuse it rather than store a token that will fail
      // silently on the first sub-account read.
      console.error("[crm] install returned no companyId; userType:", token.userType);
      return back(origin, { install: "error", reason: "not_agency" });
    }

    // Refuse a second, different agency. loadAgencyInstall takes the newest
    // row, so accepting a foreign companyId would silently repoint every
    // sub-account token mint at somebody else's account.
    const existing = await loadAgencyInstall(client);
    if (existing && existing.company_id !== companyId) {
      console.error(
        "[crm] refused install from a different agency:",
        companyId,
        "already installed:",
        existing.company_id,
      );
      return back(origin, { install: "error", reason: "other_agency" });
    }

    await saveInstall(client, companyId, "", token, null);
    console.log("[crm] agency install stored for company", companyId);
    return back(origin, { install: "ok" });
  } catch (err) {
    console.error("[crm] install failed", err);
    return back(origin, { install: "error", reason: "exchange_failed" });
  }
};
