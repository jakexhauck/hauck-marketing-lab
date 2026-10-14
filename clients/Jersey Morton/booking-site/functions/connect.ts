// GET /connect?key=ADMIN_KEY
//
// One time, run by Jersey. Sends her to Google, and Composio holds the token
// afterwards under the user id in config.ts.
//
// The key guards it so nobody else can re-point her booking calendar at their
// own Google account.

import { COMPOSIO_USER_ID } from "./lib/config.ts";
import { type Env, configured, linkAccount } from "./lib/composio.ts";

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(context.request.url);
  const env = context.env;

  // 404 rather than 403, so probing cannot tell the route exists.
  if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) {
    return new Response("Not found", { status: 404 });
  }
  if (!configured(env)) {
    return new Response("COMPOSIO_API_KEY and COMPOSIO_GCAL_AUTH_CONFIG_ID are not set", { status: 500 });
  }

  const { redirectUrl } = await linkAccount(env, {
    userId: COMPOSIO_USER_ID,
    callbackUrl: `${url.origin}/connected`,
  });
  return Response.redirect(redirectUrl, 302);
}
