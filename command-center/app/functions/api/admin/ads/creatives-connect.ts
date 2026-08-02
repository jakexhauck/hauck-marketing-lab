import type { Env, ApiData } from "../../../lib/env";
import { composioDriveConfigured, startDriveConnect } from "../../../lib/driveComposio";

// GET /api/admin/ads/creatives-connect
// Connect (or repair) the agency Google account for the creatives picker.
//
// Agency-wide, not per client: there is ONE Google account and Composio scopes
// it under user_id "hauck-agency". Whichever client happened to be in the picker
// when the button was pressed is irrelevant to the grant, so the tenant is not
// in this path.
//
// Deliberately a mirror of api/admin/sops/connect.ts rather than a shared
// helper. The two differ only in where the browser lands afterwards, and the
// landing page is the entire body of the function.
//
// Composio owns the whole exchange, so there is no callback route here: it
// captures the grant and returns the browser to `callback_url`. The page then
// re-reads the creatives endpoint and sees an ACTIVE connection. Nothing about
// the grant is stored in our own tables.
//
// Admin-only: gated centrally in api/_middleware.ts.

const LANDING = "/admin/fulfillment/paid-ads?sub=creatives";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (!composioDriveConfigured(ctx.env)) {
    return redirect(url.origin, "composio_not_configured");
  }

  // The client id rides along so the operator lands back on the client they were
  // setting up, rather than on whichever one the picker defaults to.
  const client = url.searchParams.get("client");
  const back = `${LANDING}${client ? `&client=${encodeURIComponent(client)}` : ""}&connected=1`;

  try {
    const { redirectUrl } = await startDriveConnect(ctx.env, `${url.origin}${back}`);
    return new Response(null, { status: 302, headers: { location: redirectUrl } });
  } catch (err) {
    // The reason travels in the URL because this is a browser navigation, not a
    // fetch: there is nothing on the other end to read a JSON body.
    const message = err instanceof Error ? err.message : "connect_failed";
    return redirect(url.origin, message.slice(0, 200));
  }
};

function redirect(origin: string, reason: string): Response {
  return Response.redirect(
    `${origin}${LANDING}&connect_error=${encodeURIComponent(reason)}`,
    302,
  );
}
