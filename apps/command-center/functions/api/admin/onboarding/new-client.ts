import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { AGENCY_LINK_KEYS } from "../../../../src/lib/agencyLinks";
import { onboardingCalendarId } from "../../../lib/onboardingCall";
import { funnelUrl } from "../../../lib/funnelUrl";

// GET/PUT /api/admin/onboarding/new-client  (admin-only)
//
// Everything the "Add a client" page needs before a client exists: the link to
// send them, the documents that go with it, and which calendar their onboarding
// call is booked on.
//
// The funnel link is configuration, never stored here. It is FUNNEL_URL, whose
// origin is also the only extra origin CORS lets post to /api/intake, so the
// link on this page and the address that works are the same fact. A second field
// to type it into would let Jake hand out an address the API refuses.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data } = await client.from("agency_links").select("key, url");

  const links: Record<string, string> = {};
  for (const row of ((data ?? []) as { key: string; url: string }[])) {
    links[row.key] = row.url ?? "";
  }

  return Response.json({
    // Null, not a guess. A plausible-looking link that 404s is worse than an
    // honest "not published yet", because it gets sent to a client.
    funnelUrl: funnelUrl(ctx.env),
    links,
    calendarId: onboardingCalendarId(ctx.env),
  });
};

interface PutBody {
  links?: Record<string, string>;
}

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: PutBody = {};
  try {
    body = (await ctx.request.json()) as PutBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const adminId = ctx.data.admin!.id;

  // Only the keys the app ships. An unknown key is dropped rather than stored,
  // so this endpoint cannot be used to park arbitrary rows in the table.
  const rows = Object.entries(body.links ?? {})
    .filter(([key]) => AGENCY_LINK_KEYS.includes(key))
    .map(([key, url]) => ({
      key,
      url: typeof url === "string" ? url.trim().slice(0, 2000) : "",
      updated_at: now,
      updated_by: adminId,
    }));

  if (rows.length === 0) return Response.json({ ok: true, saved: 0 });

  const { error } = await client.from("agency_links").upsert(rows, { onConflict: "key" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, adminId, "agency-links.save", null, {
    keys: rows.map((r) => r.key),
  });

  return Response.json({ ok: true, saved: rows.length });
};
