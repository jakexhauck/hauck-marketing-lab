import type { Env } from "../lib/env";
import { getServiceClient } from "../lib/supabase";
import { ghlFetch } from "../lib/ghl";
import { appMinter, resolveTenantGhl } from "../lib/ghlCreds";
import { logErrorBestEffort } from "../lib/errorLog";
import {
  CALL_NOW_TAG,
  callNowKey,
  callNowPage,
  keysMatch,
  parseCallNowParams,
  type CallNowParams,
} from "../lib/callNow";

// /api/call-now?l=<locationId>&c=<contactId>&k=<key>  (public, own key)
//
// The owner's "tap to call" link. GET shows one button; POST tags the lead
// `call-now` so the sub-account's "Call Now" workflow rings the owner and
// bridges the call. See lib/callNow.ts for why it is shaped this way.

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

const BAD_LINK = () => html(callNowPage({ title: "This link is not valid." }), 400);

async function check(env: Env, url: URL): Promise<CallNowParams | null> {
  const secret = (env.SESSION_SECRET ?? "").trim();
  if (!secret) return null;
  const params = parseCallNowParams(url);
  if (!params) return null;
  const expected = await callNowKey(secret, params.locationId);
  return keysMatch(params.key, expected) ? params : null;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (!(await check(ctx.env, url))) return BAD_LINK();
  return html(callNowPage({ title: "Call this lead?", button: { action: url.pathname + url.search } }));
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const params = await check(ctx.env, url);
  if (!params) return BAD_LINK();

  const client = getServiceClient(ctx.env);
  if (!client) return html(callNowPage({ title: "Something went wrong. Try again." }), 503);

  const { data: tenant } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("ghl_location_id", params.locationId)
    .maybeSingle();
  const creds = tenant ? await resolveTenantGhl(tenant, appMinter(client, ctx.env)) : null;
  if (!creds) return BAD_LINK();

  const ghl = { token: creds.token, locationId: creds.locationId };
  const path = `/contacts/${encodeURIComponent(params.contactId)}/tags`;
  try {
    // Off then on, so a tag left behind by a call that never connected (the
    // workflow's Remove Tag step did not run) cannot stop this tap re-firing
    // the Tag Added trigger.
    await ghlFetch(ghl, path, { method: "DELETE", body: JSON.stringify({ tags: [CALL_NOW_TAG] }) });
    const res = await ghlFetch(
      ghl,
      path,
      { method: "POST", body: JSON.stringify({ tags: [CALL_NOW_TAG] }) },
      { idempotentPost: true },
    );
    if (!res.ok) throw new Error(`tag ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    logErrorBestEffort(ctx.env, "call-now", String(err), {
      locationId: params.locationId,
      contactId: params.contactId,
    });
    return html(callNowPage({ title: "Could not start the call. Try again." }), 502);
  }

  return html(callNowPage({ title: "Ringing your phone now." }));
};
