import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  fetchAdAccounts,
  shapeAdAccounts,
  type AdAccountsResponse,
  type LinkedTenant,
} from "../../../lib/metaAdAccounts";
import { resolveMetaToken } from "../../../lib/metaToken";

// GET /api/admin/meta/ad-accounts?tenantId=...  (admin-only, gated upstream in
// _middleware.ts; owners bypass the role allowlist, so no adminRoles rule is
// needed and a cold caller or setter cannot reach it at all.)
//
// Feeds the "link the ads manager" picker: every Meta ad account the agency
// system-user token can see, each carrying its last 30 days of spend and the
// client (if any) that already holds it. tenantId is only used to say which of
// those is the client being edited; the list itself is agency-wide.
//
// Never fabricates: no token, or a Graph call that fails, answers with an empty
// list and an honest reason, and the picker falls back to pasting the id by
// hand.

const empty = (over: Partial<AdAccountsResponse>): Response =>
  Response.json({ configured: false, accounts: [], ...over } satisfies AdAccountsResponse);

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = await resolveMetaToken(ctx.env);
  if (!token) {
    return empty({ error: "No agency Meta token is configured." });
  }

  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId") ?? "";

  // Which accounts are already spoken for. Without this the picker would happily
  // point two clients at one account, which is how one client ends up reading
  // another's spend, the single failure the whole per-tenant model exists to
  // prevent. A Supabase hiccup degrades to "nothing is known to be taken"
  // rather than to no picker at all.
  let tenants: LinkedTenant[] = [];
  const client = getServiceClient(ctx.env);
  if (client) {
    const { data } = await client.from("tenants").select("id, name, meta_ad_account_id");
    tenants = (data as LinkedTenant[] | null) ?? [];
  }

  try {
    const rows = await fetchAdAccounts(token);
    return Response.json({
      configured: true,
      accounts: shapeAdAccounts(rows, tenants, tenantId),
    } satisfies AdAccountsResponse);
  } catch (err) {
    return Response.json({
      configured: true,
      accounts: [],
      error: err instanceof Error ? err.message : "Meta did not answer.",
    } satisfies AdAccountsResponse);
  }
};
