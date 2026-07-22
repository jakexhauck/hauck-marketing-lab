import type { Env, ApiData } from "../../../lib/env";
import { getConnection, disconnect, composioUserId } from "../../../lib/googleCalendar";

// The client's own Google Calendar link, managed by the client.
//
// Deliberately NOT under /api/admin: the whole point is that a client links
// their own calendar from their own Jobs page without the agency touching it.
// _middleware.ts has already resolved and authenticated the tenant.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const conn = await getConnection(ctx.env, composioUserId(ctx.data.tenant));
  // accountId stays server-side; the client only needs to know the state.
  return Response.json({ connected: conn.connected, status: conn.status });
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  try {
    await disconnect(ctx.env, composioUserId(ctx.data.tenant));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not unlink. Try again." }, { status: 502 });
  }
};
