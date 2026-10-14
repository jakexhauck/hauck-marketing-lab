// GET /api/admin/settings   prices, lengths and the timing rules
// PUT /api/admin/settings   change them
//
// Everything here is clamped and merged over the built-in defaults before it is
// stored, so a slip in the form cannot close her book for a year or sell a
// three hour bleach for nothing.

import type { Env } from "../../lib/composio.ts";
import { connectedAccountId } from "../../lib/calendar.ts";
import { ensureHoursCalendar, findHoursCalendar } from "../../lib/hoursCalendar.ts";
import { DEFAULT_SETTINGS, forgetSettingsCache, readSettings, writeSettings } from "../../lib/settings.ts";
import { type AdminEnv, requireAdmin } from "../../lib/adminAuth.ts";
import { fail, json } from "../../lib/http.ts";

type Ctx = { request: Request; env: Env & AdminEnv };

export async function onRequestGet(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return json({ settings: DEFAULT_SETTINGS, usingDefaults: true });

  const calendarId = await findHoursCalendar(context.env, accountId);
  const settings = await readSettings(context.env, accountId, calendarId);
  return json({ settings, usingDefaults: !calendarId });
}

export async function onRequestPut(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return fail("Bad request body", 400);
  }

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  try {
    const calendarId = await ensureHoursCalendar(context.env, accountId);
    const settings = await writeSettings(
      context.env,
      accountId,
      calendarId,
      (payload as { settings?: unknown })?.settings ?? payload,
    );
    // The booking page holds these for a minute; drop it so she can check her
    // own change immediately rather than wondering whether it saved.
    forgetSettingsCache();
    return json({ ok: true, settings });
  } catch {
    return fail("Could not save that just now", 502);
  }
}
