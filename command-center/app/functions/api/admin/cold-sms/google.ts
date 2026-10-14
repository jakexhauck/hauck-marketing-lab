import type { Env, ApiData } from "../../../lib/env";
import { composioConfigured, linkAccount } from "../../../lib/composio";
import { disconnect } from "../../../lib/googleCalendar";
import { AGENCY_GCAL_USER } from "../../../lib/coldSmsBoard";

// POST   /api/admin/cold-sms/google  -> { redirectUrl } to Google's consent screen
// DELETE /api/admin/cold-sms/google  -> unlink
//
// Jake's Google Calendar for the booking wizard (owner only). Rides the same
// Composio link clients use for their own calendars, under its own user id so
// it can never resolve to a client's grant. Composio does the token exchange,
// so there is no callback route: Google sends him straight back to the board.

// Where Google sends him back to. Sales > Calendar connects through the same
// link (?back=sales); a fixed list, never a path from the request.
const RETURN_PATHS = {
  sms: "/admin/pillar/acquisition?tab=sms&view=pipeline&gcal=connected",
  sales: "/admin/pillar/sales?tab=calendar&gcal=connected",
} as const;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!composioConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  try {
    const url = new URL(ctx.request.url);
    const own = url.origin;
    const back = url.searchParams.get("back") === "sales" ? RETURN_PATHS.sales : RETURN_PATHS.sms;
    // Return to the page Jake clicked from. Locally that is Vite's port, not the
    // API's (the dev proxy rewrites the request origin); only this app's own
    // origin or localhost is ever trusted as a place to send him back to.
    const sent = ctx.request.headers.get("origin") ?? "";
    const origin = sent === own || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(sent) ? sent : own;
    const { redirectUrl } = await linkAccount(ctx.env, {
      userId: AGENCY_GCAL_USER,
      callbackUrl: `${origin}${back}`,
    });
    return Response.json({ redirectUrl });
  } catch (err) {
    console.error("[cold-sms/google] link", err);
    return Response.json({ error: "Could not reach Google. Try again." }, { status: 502 });
  }
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!composioConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  try {
    await disconnect(ctx.env, AGENCY_GCAL_USER);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not disconnect. Try again." }, { status: 502 });
  }
};
