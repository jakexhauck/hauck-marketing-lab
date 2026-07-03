import type { Env, ApiData } from "../../lib/env";
import {
  readSocialAccounts,
  OAUTH_PLATFORMS,
  type ConnectionStatus,
} from "../../lib/connections";

// GET /api/connections/status - live connection state for the session's client.
// Reads the sub-account's linked social accounts and reports one state per
// platform. A read failure degrades every platform to "unknown" (never a wrong
// "connected"/"not"), so the hub shows a neutral state instead of an error.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const social = await readSocialAccounts(gctx).catch(() => null);
  const connections: ConnectionStatus[] = OAUTH_PLATFORMS.map((id) => ({
    id,
    state: social ? social[id] : "unknown",
  }));
  return Response.json({ connections });
};
