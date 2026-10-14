import type { Env, ApiData } from "../../lib/env";
import type { GhlContext } from "../../lib/ghl";
import { fetchSocialAccounts, type SocialAccount } from "./_lib";

// GET /api/social/accounts: the client's Social-Planner-linked accounts.
// `connected` is true when at least one fb/ig/gb account is linked, so the
// frontend can pick "connected but empty" vs "not connected yet" without
// guessing. Any GHL error degrades to the honest not-connected shape rather than
// a 500, so a Social tab never crashes on an upstream hiccup.

export interface AccountsData {
  accounts: SocialAccount[];
  connected: boolean;
}

const NOT_CONNECTED: AccountsData = { accounts: [], connected: false };

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  try {
    const accounts = await fetchSocialAccounts(gctx);
    return Response.json({ accounts, connected: accounts.length > 0 });
  } catch {
    return Response.json(NOT_CONNECTED);
  }
};
