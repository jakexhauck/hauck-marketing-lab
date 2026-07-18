import type { Env, ApiData } from "../../../lib/env";
import { composioConfigured, linkAccount } from "../../../lib/composio";
import { composioUserId } from "../../../lib/googleCalendar";

// Starts the client's own Google consent flow. Composio performs the token
// exchange itself, so there is no callback route of ours: the client is sent
// straight back to the Jobs calendar they started from.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!composioConfigured(ctx.env)) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const origin = new URL(ctx.request.url).origin;
    const { redirectUrl } = await linkAccount(ctx.env, {
      userId: composioUserId(ctx.data.tenant),
      callbackUrl: `${origin}/sales/jobs?calendar=connected`,
    });
    return Response.json({ redirectUrl });
  } catch {
    // White-label: never surface the broker's name to the client.
    return Response.json({ error: "Could not reach Google. Try again." }, { status: 502 });
  }
};
