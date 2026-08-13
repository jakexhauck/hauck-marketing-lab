import type { Env } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { loadTenantById, resolveGhlCreds } from "../../../../lib/tenantResolve";
import { ghlJson, type GhlContext } from "../../../../lib/ghl";
import {
  summariseOpenHours,
  toDayHours,
  toOpenHours,
  type DayHours,
  type GhlOpenHours,
} from "../../../../lib/calendarHours";
import { writeOpenHours } from "../../../../lib/ghlCalendarWrite";
import { pickEstimateCalendar } from "../../../../lib/calendarSync";
import { composioUserId, getConnection } from "../../../../lib/googleCalendar";

// GET  /api/admin/clients/:tenantId/calendars
// POST /api/admin/clients/:tenantId/calendars  { calendarIds: string[] }
//
// Fulfillment > GHL > Calendars. Which of a client's GoHighLevel calendars
// their own Google diary protects. Admin only, enforced upstream in
// _middleware.ts.
//
// The calendars themselves are read LIVE from GHL on every load rather than
// cached. A stale list here would mean an operator ticking a calendar that no
// longer exists, and a sync writing blocks into nothing forever.
//
// Live mode only, like the sync itself: a client's test workspace linking a
// calendar must never decide what their real sub-account blocks.

interface RawCalendar {
  id?: string;
  name?: string;
  isActive?: boolean;
  calendarType?: string;
  openHours?: GhlOpenHours[];
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  // Whether the client has actually linked Google. Everything else on the page
  // is decoration until they have: with no grant there is no busy time to push,
  // and ticking calendars achieves nothing.
  const conn = await getConnection(
    ctx.env,
    composioUserId({ slug: tenant.slug, mode: "live" }),
  );

  const creds = resolveGhlCreds(tenant);
  if (!creds) {
    return Response.json({
      googleLinked: conn.connected,
      crmWired: false,
      calendars: [],
      usingFallback: false,
    });
  }

  const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };

  let raw: RawCalendar[] = [];
  try {
    const data = await ghlJson<{ calendars?: RawCalendar[] }>(
      gctx,
      `/calendars/?locationId=${encodeURIComponent(creds.locationId)}`,
    );
    raw = data.calendars ?? [];
  } catch (err) {
    return Response.json(
      { error: `could not read calendars from GHL: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const { data: selectedRows } = await client
    .from("tenant_blocked_calendars")
    .select("ghl_calendar_id")
    .eq("tenant_id", tenantId);
  const selected = new Set(
    (selectedRows ?? []).map((r) => (r as { ghl_calendar_id: string }).ghl_calendar_id),
  );

  // With no selection the sync still protects the estimate calendar by name,
  // so the page shows that as blocked and says where it came from. Otherwise an
  // operator reads "nothing is protected" off a screen that is lying to them.
  const fallback =
    selected.size === 0
      ? pickEstimateCalendar(
          raw.map((c) => ({ id: String(c.id ?? ""), name: c.name })),
          tenant.estimate_calendar_id,
        )
      : null;

  const calendars = raw
    .filter((c) => typeof c.id === "string" && c.id)
    .map((c) => ({
      id: c.id as string,
      name: c.name ?? "Untitled calendar",
      active: c.isActive !== false,
      kind: c.calendarType ?? null,
      hours: summariseOpenHours(c.openHours),
      // The same hours a day at a time, which is how the editor works and how
      // anybody actually thinks about opening times.
      days: toDayHours(c.openHours),
      blocked: selected.size > 0 ? selected.has(c.id as string) : fallback?.id === c.id,
    }));

  return Response.json({
    googleLinked: conn.connected,
    crmWired: true,
    usingFallback: selected.size === 0,
    calendars,
  });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: { calendarIds?: unknown; action?: unknown; calendarId?: unknown; days?: unknown };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // Opening hours, written straight into GHL. There is no draft state and no
  // "publish" step: the client's booking page is the only copy of this, so
  // saving here IS saving there.
  if (body.action === "hours") {
    const calendarId = typeof body.calendarId === "string" ? body.calendarId : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(calendarId)) {
      return Response.json({ error: "invalid calendar id" }, { status: 400 });
    }
    const openHours = toOpenHours((body.days ?? []) as DayHours[]);
    if (!openHours) {
      return Response.json(
        { error: "Every open time needs a later closing time." },
        { status: 400 },
      );
    }
    const creds = resolveGhlCreds(tenant);
    if (!creds) return Response.json({ error: "this client's GHL is not wired" }, { status: 409 });
    try {
      const updated = await writeOpenHours(
        { token: creds.token, locationId: creds.locationId },
        calendarId,
        openHours,
      );
      return Response.json({
        ok: true,
        hours: summariseOpenHours((updated.openHours ?? openHours) as GhlOpenHours[]),
      });
    } catch (err) {
      return Response.json(
        { error: `GHL refused the change: ${(err as Error).message}` },
        { status: 502 },
      );
    }
  }

  const ids = Array.isArray(body.calendarIds) ? body.calendarIds : null;
  if (!ids) return Response.json({ error: "calendarIds must be an array" }, { status: 400 });

  // GHL ids go into a URL path in the sync, so they are validated rather than
  // escaped, exactly as socialConnect.ts does: a value that is not an id is a
  // bug or an attack, and neither deserves a row.
  const clean = [...new Set(ids.filter((v): v is string => typeof v === "string"))].filter((v) =>
    /^[A-Za-z0-9_-]{1,64}$/.test(v),
  );
  if (clean.length !== ids.length) {
    return Response.json({ error: "invalid calendar id" }, { status: 400 });
  }

  // Replace rather than merge: the page sends the whole selection, so a
  // calendar removed from it must lose its row. The sync then sees a block on a
  // calendar it no longer protects and hands the slot back on its next run.
  const { error: delErr } = await client
    .from("tenant_blocked_calendars")
    .delete()
    .eq("tenant_id", tenantId);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (clean.length > 0) {
    const names = new Map<string, string>();
    if (Array.isArray((body as { names?: unknown }).names)) {
      for (const entry of (body as { names: unknown[] }).names) {
        const row = entry as { id?: unknown; name?: unknown };
        if (typeof row?.id === "string" && typeof row?.name === "string") {
          names.set(row.id, row.name.slice(0, 120));
        }
      }
    }
    const { error } = await client.from("tenant_blocked_calendars").insert(
      clean.map((id) => ({
        tenant_id: tenantId,
        ghl_calendar_id: id,
        name: names.get(id) ?? null,
      })),
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, count: clean.length });
};
