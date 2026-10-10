import type { Env } from "./env";
import { getServiceClient } from "./supabase";
import { ghlFetch } from "./ghl";
import { appMinter, resolveTenantGhl } from "./ghlCreds";
import { logErrorBestEffort } from "./errorLog";
import { callNowPage, keysMatch, linkKey, parseCallNowParams, type CallNowParams } from "./callNow";

// The GET + POST pair behind every "tap to call" owner link. GET shows one
// button; POST tags the lead so that sub-account's workflow rings the owner and
// bridges the call. See lib/callNow.ts for why it is shaped this way.
//
// Each link has its own key purpose (a leaked key opens only its own link) and
// its own tag (each fires its own GHL workflow).

export interface CallLink {
  // Key purpose. Never change one already live: every key pasted into GHL
  // would stop working.
  purpose: string;
  tag: string;
  // Error log source.
  source: string;
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

const BAD_LINK = () => html(callNowPage({ title: "This link is not valid." }), 400);

async function check(env: Env, url: URL, purpose: string): Promise<CallNowParams | null> {
  const secret = (env.SESSION_SECRET ?? "").trim();
  if (!secret) return null;
  const params = parseCallNowParams(url);
  if (!params) return null;
  const expected = await linkKey(secret, purpose, params.locationId);
  return keysMatch(params.key, expected) ? params : null;
}

export function callLinkHandlers(link: CallLink): {
  onRequestGet: PagesFunction<Env>;
  onRequestPost: PagesFunction<Env>;
} {
  const onRequestGet: PagesFunction<Env> = async (ctx) => {
    const url = new URL(ctx.request.url);
    if (!(await check(ctx.env, url, link.purpose))) return BAD_LINK();
    return html(callNowPage({ title: "Call this lead?", button: { action: url.pathname + url.search } }));
  };

  const onRequestPost: PagesFunction<Env> = async (ctx) => {
    const url = new URL(ctx.request.url);
    const params = await check(ctx.env, url, link.purpose);
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
      await ghlFetch(ghl, path, { method: "DELETE", body: JSON.stringify({ tags: [link.tag] }) });
      const res = await ghlFetch(
        ghl,
        path,
        { method: "POST", body: JSON.stringify({ tags: [link.tag] }) },
        { idempotentPost: true },
      );
      if (!res.ok) throw new Error(`tag ${res.status}: ${(await res.text()).slice(0, 300)}`);
    } catch (err) {
      logErrorBestEffort(ctx.env, link.source, String(err), {
        locationId: params.locationId,
        contactId: params.contactId,
      });
      return html(callNowPage({ title: "Could not start the call. Try again." }), 502);
    }

    return html(callNowPage({ title: "Ringing your phone now." }));
  };

  return { onRequestGet, onRequestPost };
}
