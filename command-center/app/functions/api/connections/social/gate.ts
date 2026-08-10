import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { fetchSocialAccounts } from "../../social/_lib";
import type { GhlContext } from "../../../lib/ghl";
import { composioUserId, getConnection } from "../../../lib/googleCalendar";

// GET /api/connections/social/gate -> { blocked, facebook, instagram, reason }
//
// The single question the blocking modal asks: may this client use the app yet?
//
// Computed on the SERVER so the browser is never trusted with the answer, and
// so the rule lives in one place rather than being reassembled from two calls in
// the UI. `blocked` is the only field the gate needs; the rest drives which step
// of the wizard opens and what the admin sees.
//
// Deliberately fails OPEN. If GHL cannot be reached we do not know whether the
// client is connected, and locking somebody out of paid software on the strength
// of an upstream hiccup is worse than letting an unconnected client in for one
// session. The gate reappears the moment the answer is knowable again.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;

  const open = (reason: string) =>
    Response.json({
      blocked: false,
      facebook: false,
      instagram: false,
      calendar: false,
      calendarRequired: false,
      reason,
    });

  // A client whose GHL is not wired yet cannot connect anything, so gating them
  // would be a locked door with no key. That is an agency-side gap, not theirs.
  if (isPlaceholder(t.ghl_location_id) || isPlaceholder(t.ghl_token)) {
    return open("not_configured");
  }

  const client = getServiceClient(ctx.env);
  // Whether this client has to link a Google Calendar to get in. Every tenant
  // that existed before the calendar step shipped was grandfathered by
  // migration 0101, so nobody was locked out by the deploy; new clients are
  // gated from the day they are created. Un-waiving one is a deliberate act.
  let calendarRequired = false;
  if (client) {
    const { data } = await client
      .from("tenants")
      .select("social_gate_waived, calendar_gate_waived")
      .eq("slug", t.slug)
      .maybeSingle();
    if (data?.social_gate_waived) return open("waived");
    calendarRequired = data ? !data.calendar_gate_waived : false;
  }

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  let facebook = false;
  let instagram = false;
  try {
    const accounts = await fetchSocialAccounts(gctx);
    facebook = accounts.some((a) => a.platform === "fb");
    instagram = accounts.some((a) => a.platform === "ig");
  } catch {
    return open("upstream_unavailable");
  }

  // The calendar link lives with Composio, not GHL, so it is read separately and
  // cannot be taken down by the same upstream hiccup. Its own failure mode is
  // already "not connected", which is the safe direction: it holds the gate
  // shut rather than letting somebody through on an error.
  let calendar = false;
  if (calendarRequired) {
    const conn = await getConnection(ctx.env, composioUserId({ slug: t.slug, mode: t.mode }));
    calendar = conn.connected;
  }

  const connected = facebook && instagram && (!calendarRequired || calendar);

  return Response.json({
    blocked: !connected,
    facebook,
    instagram,
    calendar,
    calendarRequired,
    reason: connected ? "connected" : "missing",
  });
};
