// GET /api/config
//
// The public values the page needs at runtime, including her live prices and
// service lengths. The page ships with a copy of the list so it can paint
// before this answers, then reconciles against whatever comes back here.
//
// Site keys are public by design. The secret half never leaves the Function.

import { CONTACT_PHONE_FALLBACK, TIMEZONE } from "../lib/config.ts";
import { type TurnstileEnv } from "../lib/turnstile.ts";
import type { Env } from "../lib/composio.ts";
import { connectedAccountId } from "../lib/calendar.ts";
import { findHoursCalendar } from "../lib/hoursCalendar.ts";
import { DEFAULT_SETTINGS, readSettings } from "../lib/settings.ts";
import { json } from "../lib/http.ts";

export async function onRequestGet(context: {
  env: Env & TurnstileEnv & { CONTACT_PHONE?: string };
}): Promise<Response> {
  const env = context.env;

  // Prices must never take the page down. Anything unreadable falls back to
  // the built-in list, which is also what the page is already showing.
  let settings = DEFAULT_SETTINGS;
  try {
    const accountId = await connectedAccountId(env);
    if (accountId) {
      settings = await readSettings(env, accountId, await findHoursCalendar(env, accountId));
    }
  } catch {
    /* defaults */
  }

  return json({
    timezone: TIMEZONE,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "",
    // Shown only when the page has no times to offer. Empty means the page
    // says nothing about phoning rather than inventing a number.
    contactPhone: env.CONTACT_PHONE ?? CONTACT_PHONE_FALLBACK,
    services: settings.services,
    addons: settings.addons,
  });
}
