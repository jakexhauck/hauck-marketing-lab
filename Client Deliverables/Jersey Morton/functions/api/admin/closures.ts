// GET    /api/admin/closures   days she has closed from this page
// POST   /api/admin/closures   close one
// DELETE /api/admin/closures?eventId=  reopen one
//
// A closure is an all-day busy event on her primary calendar, so it is
// subtracted by exactly the same path that handles an appointment. Blocking the
// day by hand in Google does the same thing; this is the version with a button.

import type { Env } from "../../lib/composio.ts";
import { closeDay, connectedAccountId, listClosures, reopenDay } from "../../lib/calendar.ts";
import { type AdminEnv, requireAdmin } from "../../lib/adminAuth.ts";
import { cleanText, fail, json } from "../../lib/http.ts";
import { isValidDate } from "../../lib/time.ts";

type Ctx = { request: Request; env: Env & AdminEnv };

export async function onRequestGet(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  try {
    return json({ closures: await listClosures(context.env, accountId) });
  } catch {
    return fail("Could not read your calendar just now", 503);
  }
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return fail("Bad request body", 400);
  }

  const date = cleanText(payload.date, 10);
  if (!isValidDate(date)) return fail("Pick a date", 400);
  const reason = cleanText(payload.reason, 60) || "Closed";

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  try {
    await closeDay(context.env, accountId, date, reason);
    return json({ ok: true, closures: await listClosures(context.env, accountId) }, 201);
  } catch {
    return fail("Could not close that day just now", 502);
  }
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  const eventId = new URL(context.request.url).searchParams.get("eventId") ?? "";
  if (!eventId) return fail("Which day?", 400);

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  try {
    await reopenDay(context.env, accountId, eventId);
    return json({ ok: true, closures: await listClosures(context.env, accountId) });
  } catch {
    // Includes the deliberate refusal to delete something this page did not
    // create, which is not worth distinguishing to the person pressing it.
    return fail("Could not reopen that day", 502);
  }
}
