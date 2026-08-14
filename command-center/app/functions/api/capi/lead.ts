import type { Env, ApiData } from "../../lib/env";
import { FUNNEL_CAPI, originAllowedForFunnel, sendLeadEvent } from "../../lib/metaCapi";
import { rememberIdentity } from "../../lib/capiIdentity";
import { resolveMetaToken } from "../../lib/metaToken";
import { getServiceClient } from "../../lib/supabase";

// POST /api/capi/lead  -> reports one funnel conversion to Meta.
//
// Called by the served funnel files (public/sites/<client>/quote.js) with
// navigator.sendBeacon the moment GHL accepts the lead. sendBeacon and not
// fetch, because the page redirects to the booking step in the same tick and a
// plain fetch is cancelled mid-flight. The same trap bit the Made Better review
// funnel; do not "simplify" it back.
//
// PUBLIC ON PURPOSE, and listed in _middleware.ts. A homeowner filling in a
// landing page on the client's own domain has no session and never will. The
// guards are, in order:
//
//   the funnel slug must be one we ship         (unknown funnel -> 404)
//   the Origin must be that funnel's own domain (anything else  -> 403)
//   the event name is always Lead               (never taken from the body)
//
// That last one matters most: the body cannot choose what gets written into a
// client's pixel, only that a Lead happened. See lib/metaCapi.ts for why GHL's
// own Meta Conversion API action cannot do this job.

// Accepts sendBeacon's form encoding and plain JSON, so the endpoint can be
// exercised with curl without pretending to be a browser.
async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const parsed = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = v == null ? "" : String(v);
    return out;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : "";
  return out;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = await resolveMetaToken(ctx.env);
  if (!token) return Response.json({ error: "meta not configured" }, { status: 503 });

  const body = await readBody(ctx.request);

  const funnelKey = (body.funnel ?? "").trim();
  const funnel = FUNNEL_CAPI[funnelKey];
  if (!funnel) return Response.json({ error: "unknown funnel" }, { status: 404 });

  const origin = ctx.request.headers.get("origin");
  if (!originAllowedForFunnel(origin, funnel)) {
    return Response.json({ error: "origin not allowed" }, { status: 403 });
  }

  const eventId = (body.event_id ?? "").trim();
  if (!eventId) return Response.json({ error: "event_id is required" }, { status: 400 });

  // The funnel stamps the time, so a beacon delivered late is still attributed
  // to the moment the homeowner actually converted. A missing or unparseable
  // one falls back to now rather than failing the report.
  const stamped = Number.parseInt(body.event_time ?? "", 10);
  const eventTime =
    Number.isFinite(stamped) && stamped > 0 ? stamped : Math.floor(Date.now() / 1000);

  const result = await sendLeadEvent(token, funnel, {
    eventId,
    eventTime,
    sourceUrl: body.event_source_url ?? "",
    who: {
      email: body.email,
      phone: body.phone,
      firstName: body.first_name,
      lastName: body.last_name,
      city: body.city,
      state: body.state,
      zip: body.zip,
      // Every one of these funnels is US-only; the survey turns away anyone
      // outside the client's metro on its first question.
      country: body.country || "us",
    },
    signals: {
      fbc: body.fbc,
      fbp: body.fbp,
      // Cloudflare's, not the body's. A browser cannot be trusted to report its
      // own IP and Meta weighs this heavily in the match.
      ip: ctx.request.headers.get("cf-connecting-ip") ?? undefined,
      userAgent: ctx.request.headers.get("user-agent") ?? undefined,
    },
    testEventCode: body.test_event_code || undefined,
  });

  // Keep the click signals, so the Schedule event fired when this person books
  // days from now can still be matched to the ad that produced them. After the
  // send and never allowed to fail it: a lost row costs future match quality,
  // a thrown error would cost the conversion we have already reported.
  const client = getServiceClient(ctx.env);
  if (client) {
    try {
      await rememberIdentity(
        client,
        funnelKey,
        { email: body.email, phone: body.phone },
        { fbc: body.fbc, fbp: body.fbp },
        body.event_source_url,
      );
    } catch (err) {
      console.warn("[capi/lead] identity write threw", err);
    }
  }

  // 502 when Meta refused, so a curl of this endpoint tells the truth. The
  // browser never reads either answer: sendBeacon discards the response.
  return Response.json(result, { status: result.ok ? 200 : 502 });
};
