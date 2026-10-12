import type { Env } from "../lib/env";
import { getServiceClient } from "../lib/supabase";
import { linkKey, callNowPage } from "../lib/callNow";
import { resolveShortCode } from "../lib/ownerShortLink";

// /api/n?o=<code>&c=<contactId>  (public, signed code)
//
// The short owner link texted from a GHL workflow. Finds which client and link
// the code is, then redirects to the long link with its key, so every owner page
// and its checks stay exactly as they were. The Text Them link redirects to the
// lead's conversation in the client app instead, which has its own login. See
// lib/ownerShortLink.ts.

const ID = /^[A-Za-z0-9]{8,64}$/;

function bad(): Response {
  return new Response(callNowPage({ title: "This link is not valid." }), {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = (url.searchParams.get("o") ?? "").trim();
  const contactId = (url.searchParams.get("c") ?? "").trim();
  const secret = (ctx.env.SESSION_SECRET ?? "").trim();
  if (!secret || !code || !ID.test(contactId)) return bad();

  const client = getServiceClient(ctx.env);
  if (!client) return bad();
  const { data } = await client.from("tenants").select("ghl_location_id").not("ghl_location_id", "is", null);
  const locations = (data ?? [])
    .map((t) => String((t as { ghl_location_id: string | null }).ghl_location_id ?? "").trim())
    .filter((l) => ID.test(l));

  const hit = await resolveShortCode(secret, code, locations);
  if (!hit) return bad();

  if (hit.target.kind === "app") {
    const to = new URL(`${hit.target.path}/${encodeURIComponent(contactId)}`, url.origin);
    return new Response(null, { status: 302, headers: { location: to.toString(), "cache-control": "no-store" } });
  }

  const key = await linkKey(secret, hit.target.purpose, hit.locationId);
  const to = new URL(hit.target.path, url.origin);
  to.searchParams.set("l", hit.locationId);
  to.searchParams.set("c", contactId);
  to.searchParams.set("k", key);
  return new Response(null, { status: 302, headers: { location: to.toString(), "cache-control": "no-store" } });
};
