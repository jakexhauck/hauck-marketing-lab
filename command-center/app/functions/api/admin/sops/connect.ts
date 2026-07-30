import type { Env, ApiData } from "../../../lib/env";
import { composioDriveConfigured, startDriveConnect } from "../../../lib/driveComposio";

// GET /api/admin/sops/connect — (re)connect the agency Google account for SOPs.
//
// Replaces the Google-Cloud OAuth start this tab used to point at. That flow ran
// on the agency's own OAuth client, whose consent screen is in Testing: it
// answered "access_denied, only developer-approved testers" and would have
// expired the token weekly even once the tester was added. This hands the consent
// to Composio's already-verified Google app instead.
//
// Composio owns the whole exchange, so there is no callback route to write here:
// it captures the grant against user_id "hauck-agency" and returns the browser to
// `callback_url`. The tab then re-reads /api/admin/sops and sees an ACTIVE
// connection. Nothing about the grant is stored in our own tables.
//
// Admin-only: gated centrally in api/_middleware.ts.

const LANDING = "/admin/pillar/operations?tab=sops";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (!composioDriveConfigured(ctx.env)) {
    return redirect(url.origin, "composio_not_configured");
  }

  try {
    const { redirectUrl } = await startDriveConnect(
      ctx.env,
      `${url.origin}${LANDING}&connected=1`,
    );
    return new Response(null, { status: 302, headers: { location: redirectUrl } });
  } catch (err) {
    // The reason travels in the URL because this is a browser navigation, not a
    // fetch: there is nothing on the other end to read a JSON body.
    const message = err instanceof Error ? err.message : "connect_failed";
    return redirect(url.origin, message.slice(0, 200));
  }
};

function redirect(origin: string, reason: string): Response {
  return Response.redirect(`${origin}${LANDING}&connect_error=${encodeURIComponent(reason)}`, 302);
}
